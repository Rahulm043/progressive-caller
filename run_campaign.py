import asyncio
import json
import os
import random
import time
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv
from livekit import api
from supabase import Client, create_client

# Load environment variables
load_dotenv(".env")
if os.path.exists("call-manager/.env.local"):
    load_dotenv("call-manager/.env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
LK_URL = os.getenv("LIVEKIT_URL")
LK_API_KEY = os.getenv("LIVEKIT_API_KEY")
LK_API_SECRET = os.getenv("LIVEKIT_API_SECRET")

IDLE_POLL_SECONDS = int(os.getenv("CAMPAIGN_RUNNER_IDLE_POLL_SECONDS", "5"))
DISPATCH_COOLDOWN_SECONDS = int(os.getenv("CAMPAIGN_RUNNER_DISPATCH_COOLDOWN_SECONDS", "30"))
RECONCILE_EVERY_SECONDS = int(os.getenv("CAMPAIGN_RUNNER_RECONCILE_SECONDS", "30"))
STALE_DISPATCHING_SECONDS = int(os.getenv("CAMPAIGN_RUNNER_STALE_DISPATCHING_SECONDS", "180"))
STALE_IN_PROGRESS_SECONDS = int(os.getenv("CAMPAIGN_RUNNER_STALE_IN_PROGRESS_SECONDS", "5400"))

ACTIVE_CALL_STATUSES = {"dispatching", "ringing", "connected", "in_progress"}

if not (SUPABASE_URL and SUPABASE_KEY):
    print("Error: Supabase config missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
    raise SystemExit(1)

if not (LK_URL and LK_API_KEY and LK_API_SECRET):
    print("Error: LiveKit credentials missing.")
    raise SystemExit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    return utc_now().isoformat().replace("+00:00", "Z")


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)
    except Exception:
        return None


def _coerce_agent_config(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return None
    return None


def fetch_campaign(campaign_id: str, cache: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    if campaign_id in cache:
        return cache[campaign_id]
    response = (
        supabase.table("campaigns")
        .select("id,status,starts_at")
        .eq("id", campaign_id)
        .limit(1)
        .execute()
    )
    campaign = response.data[0] if response.data else None
    if campaign:
        cache[campaign_id] = campaign
    return campaign


def is_campaign_eligible_for_dispatch(call_record: dict[str, Any], cache: dict[str, dict[str, Any]]) -> bool:
    campaign_id = call_record.get("campaign_id")
    if not campaign_id:
        return True

    campaign = fetch_campaign(str(campaign_id), cache)
    if not campaign:
        return False

    status = str(campaign.get("status") or "").lower()
    if status in {"paused", "cancelled", "completed", "failed"}:
        return False

    starts_at = parse_iso(campaign.get("starts_at"))
    if status == "scheduled" and starts_at and starts_at > utc_now():
        return False

    return True


def claim_next_eligible_call() -> dict[str, Any] | None:
    now_iso = utc_now_iso()
    response = (
        supabase.table("calls")
        .select("*")
        .eq("status", "queued")
        .or_(f"starts_at.is.null,starts_at.lte.{now_iso}")
        .order("sequence", desc=False)
        .limit(25)
        .execute()
    )

    candidates = response.data or []
    if not candidates:
        return None

    campaign_cache: dict[str, dict[str, Any]] = {}
    for call_record in candidates:
        if not is_campaign_eligible_for_dispatch(call_record, campaign_cache):
            continue

        claim_response = (
            supabase.table("calls")
            .update({"status": "dispatching"}, count="exact")
            .eq("id", call_record["id"])
            .eq("status", "queued")
            .execute()
        )

        claimed_count = getattr(claim_response, "count", None)
        if isinstance(claimed_count, int):
            if claimed_count <= 0:
                continue
        else:
            claim_data = getattr(claim_response, "data", None)
            if not claim_data:
                continue

        claimed_row = (
            supabase.table("calls")
            .select("*")
            .eq("id", call_record["id"])
            .limit(1)
            .execute()
        )
        if claimed_row.data:
            return claimed_row.data[0]

    return None


def maybe_mark_campaign_running(campaign_id: str | None) -> None:
    if not campaign_id:
        return
    campaign_res = (
        supabase.table("campaigns")
        .select("status,starts_at")
        .eq("id", campaign_id)
        .limit(1)
        .execute()
    )
    if not campaign_res.data:
        return
    campaign = campaign_res.data[0]
    status = str(campaign.get("status") or "").lower()
    starts_at = parse_iso(campaign.get("starts_at"))
    if status == "scheduled" and (starts_at is None or starts_at <= utc_now()):
        (
            supabase.table("campaigns")
            .update({"status": "running"})
            .eq("id", campaign_id)
            .execute()
        )


async def dispatch_call(call_record: dict[str, Any]) -> None:
    lk_api = api.LiveKitAPI(url=LK_URL, api_key=LK_API_KEY, api_secret=LK_API_SECRET)
    phone_number = str(call_record["phone_number"])
    call_id = str(call_record["id"])
    campaign_id = call_record.get("campaign_id")
    preset_id = call_record.get("preset_id")
    agent_config = _coerce_agent_config(call_record.get("agent_config"))
    room_name = f"call-{phone_number.replace('+', '')}-{random.randint(1000, 9999)}"

    print(f"[{time.strftime('%X')}] Dispatching call {call_id} to {phone_number} (room={room_name})")

    try:
        metadata = {"phone_number": phone_number, "call_id": call_id}
        if preset_id:
            metadata["preset_id"] = preset_id
        if agent_config:
            metadata["agent_config"] = agent_config
            if isinstance(agent_config.get("language"), str) and agent_config.get("language").strip():
                metadata["language"] = agent_config.get("language").strip()
            if isinstance(agent_config.get("prompt"), str) and agent_config.get("prompt").strip():
                metadata["prompt"] = agent_config.get("prompt").strip()
            greeting_instruction = agent_config.get("greetingInstruction") or agent_config.get("greeting_instruction")
            if isinstance(greeting_instruction, str) and greeting_instruction.strip():
                metadata["greeting_instruction"] = greeting_instruction.strip()
            recipient_profile = agent_config.get("recipientProfile") or agent_config.get("recipient_profile")
            if isinstance(recipient_profile, str) and recipient_profile.strip():
                metadata["recipient_profile"] = recipient_profile.strip()

        dispatch_request = api.CreateAgentDispatchRequest(
            agent_name="outbound-caller",
            room=room_name,
            metadata=json.dumps(metadata),
        )
        dispatch = await lk_api.agent_dispatch.create_dispatch(dispatch_request)

        (
            supabase.table("calls")
            .update(
                {
                    "status": "in_progress",
                    "livekit_room_name": room_name,
                    "dispatch_id": dispatch.id,
                }
            )
            .eq("id", call_id)
            .execute()
        )

        maybe_mark_campaign_running(str(campaign_id) if campaign_id else None)
        print(f"[ok] dispatched call_id={call_id}, dispatch_id={dispatch.id}")
    except Exception as exc:
        print(f"[error] dispatch failed for call_id={call_id}: {exc}")
        (
            supabase.table("calls")
            .update({"status": "failed"})
            .eq("id", call_id)
            .execute()
        )
    finally:
        await lk_api.aclose()


def reconcile_campaign_states() -> None:
    now = utc_now()
    campaigns_res = (
        supabase.table("campaigns")
        .select("id,status,starts_at")
        .in_("status", ["scheduled", "running", "completed", "failed"])
        .execute()
    )
    campaigns = campaigns_res.data or []

    for campaign in campaigns:
        campaign_id = campaign["id"]
        current_status = str(campaign.get("status") or "").lower()
        starts_at = parse_iso(campaign.get("starts_at"))

        calls_res = (
            supabase.table("calls")
            .select("status")
            .eq("campaign_id", campaign_id)
            .execute()
        )
        statuses = [str(item.get("status") or "").lower() for item in (calls_res.data or [])]

        total = len(statuses)
        queued = sum(1 for s in statuses if s == "queued")
        active = sum(1 for s in statuses if s in ACTIVE_CALL_STATUSES)
        completed = sum(1 for s in statuses if s == "completed")
        failed = sum(1 for s in statuses if s == "failed")

        if total == 0:
            desired_status = "scheduled" if (starts_at and starts_at > now) else "running"
        elif queued == 0 and active == 0:
            desired_status = "completed" if completed > 0 else "failed"
        elif starts_at and starts_at > now and completed == 0 and failed == 0 and active == 0:
            desired_status = "scheduled"
        else:
            desired_status = "running"

        if desired_status != current_status:
            (
                supabase.table("campaigns")
                .update({"status": desired_status})
                .eq("id", campaign_id)
                .execute()
            )


def recover_stale_active_calls() -> None:
    response = (
        supabase.table("calls")
        .select("id,created_at,status,dispatch_id,transcript,campaign_id")
        .in_("status", ["dispatching", "ringing", "connected", "in_progress"])
        .limit(100)
        .execute()
    )
    rows = response.data or []
    if not rows:
        return

    now = utc_now()
    for row in rows:
        status = str(row.get("status") or "").lower()
        dispatch_id = row.get("dispatch_id")
        created_at = parse_iso(row.get("created_at"))
        if not created_at:
            continue

        transcript = row.get("transcript")
        last_update = None
        if isinstance(transcript, dict):
            last_update = parse_iso(str(transcript.get("updated_at") or ""))
        reference_time = last_update or created_at
        age_seconds = (now - created_at).total_seconds()

        if status == "dispatching":
            if dispatch_id:
                continue
            if age_seconds < STALE_DISPATCHING_SECONDS:
                continue
            (
                supabase.table("calls")
                .update({"status": "queued"})
                .eq("id", row["id"])
                .eq("status", "dispatching")
                .execute()
            )
            continue

        idle_seconds = (now - reference_time).total_seconds() if reference_time else age_seconds
        if idle_seconds >= STALE_IN_PROGRESS_SECONDS:
            (
                supabase.table("calls")
                .update({"status": "failed"})
                .eq("id", row["id"])
                .in_("status", ["ringing", "connected", "in_progress"])
                .execute()
            )


def process_queue() -> None:
    print("[runner] campaign queue runner started")
    print("[runner] polling queued calls and dispatching through LiveKit")

    last_reconcile = 0.0

    while True:
        try:
            call_record = claim_next_eligible_call()
            if call_record:
                asyncio.run(dispatch_call(call_record))
                time.sleep(DISPATCH_COOLDOWN_SECONDS)
            else:
                time.sleep(IDLE_POLL_SECONDS)

            now = time.monotonic()
            if now - last_reconcile >= RECONCILE_EVERY_SECONDS:
                reconcile_campaign_states()
                recover_stale_active_calls()
                last_reconcile = now
        except Exception as exc:
            print(f"[runner-error] {exc}")
            time.sleep(10)


if __name__ == "__main__":
    process_queue()
