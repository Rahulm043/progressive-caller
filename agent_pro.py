import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from livekit import api, rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    AudioConfig,
    BackgroundAudioPlayer,
    BuiltinAudioClip,
    ChatContext,
    JobContext,
    JobProcess,
    MetricsCollectedEvent,
    AgentStateChangedEvent,
    cli,
    inference,
    metrics,
    room_io,
)
try:
    from livekit.plugins import noise_cancellation, sarvam, silero
except ImportError:
    from livekit.plugins import noise_cancellation, silero

    sarvam = None
from livekit.plugins.turn_detector.multilingual import MultilingualModel
from supabase import Client, create_client

load_dotenv(".env")
if os.path.exists("call-manager/.env.local"):
    load_dotenv("call-manager/.env.local")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("agent-pro")


def _json_safe(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(v) for v in value]
    if hasattr(value, "model_dump"):
        return _json_safe(value.model_dump())
    if hasattr(value, "dict"):
        try:
            return _json_safe(value.dict())
        except Exception:
            pass
    if hasattr(value, "__dict__"):
        return _json_safe({k: v for k, v in value.__dict__.items() if not k.startswith("_")})
    return str(value)


def _parse_float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except Exception:
        return default


def _coerce_text(value) -> str | None:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return None


def _build_prompt(language_clause: str, body: str | None = None) -> str:
    body = (body or """Speak naturally, briefly, and without sounding scripted.
Keep responses conversational, human, and adaptable to the user.
Use one short sentence when possible, and ask one relevant question if it helps the flow.
For the opening line, do not ask if it is a bad time. Prefer asking if now is a good time,
or say you are calling briefly to introduce voice agents and AI automations for businesses.
Adapt the opener to the language and social context.
Do not use markdown, lists, or long monologues.
Do not end the call on your own.
Only stop speaking when the user has clearly finished or the call has naturally ended.""").strip()
    return f"""You are Riya from Progressive AI.
{language_clause}
{body}"""


OUTBOUND_TRUNK_ID = os.getenv("OUTBOUND_TRUNK_ID")
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    or os.getenv("SUPABASE_KEY")
)

def _resolve_background_clip() -> BuiltinAudioClip:
    clip_name = _coerce_text(os.getenv("AGENT_PRO_BACKGROUND_AUDIO_CLIP")) or "OFFICE_AMBIENCE"
    clip_attr = clip_name.replace("-", "_").upper()
    clip = getattr(BuiltinAudioClip, clip_attr, None)
    if clip is None:
        logger.warning(
            "Unknown AGENT_PRO_BACKGROUND_AUDIO_CLIP=%s. Falling back to BuiltinAudioClip.OFFICE_AMBIENCE.",
            clip_name,
        )
        return BuiltinAudioClip.OFFICE_AMBIENCE
    return clip


DEFAULT_BACKGROUND_AUDIO = _resolve_background_clip()
DEFAULT_BACKGROUND_VOLUME = _parse_float_env("AGENT_PRO_BACKGROUND_VOLUME", 1.0)

SESSION_PRESETS = {
    "default": {
        "label": "Default",
        "language_label": "English",
        "language_prompt_line": "Speak in English by default unless the user clearly speaks another language first.",
        "stt_model": "cartesia/ink-whisper",
        "stt_language": "en",
        "stt_mode": "transcribe",
        "llm_model": "openai/gpt-4.1-nano",
        "tts_model": "inworld/inworld-tts-1.5-mini",
        "tts_voice": "Riya",
        "tts_language": "hi-IN",
        "turn_detection": "multilingual",
        "min_endpointing_delay": 0.28,
        "greeting_instruction": (
            "Greet the person naturally in English in one short sentence. Say you are Riya "
            "from Progressive AI, briefly mention you are calling to introduce voice agents "
            "and AI automations for businesses, and ask if now is a good time to talk. "
            "Do not sound scripted or ask if it is a bad time."
        ),
        "prompt": _build_prompt("Speak in English by default unless the user clearly speaks another language first."),
        "background_audio": DEFAULT_BACKGROUND_AUDIO,
        "background_volume": DEFAULT_BACKGROUND_VOLUME,
    },
    "english_x": {
        "label": "English X",
        "language_label": "English",
        "language_prompt_line": "Speak in English by default unless the user clearly speaks another language first.",
        "stt_model": "cartesia/ink-whisper",
        "stt_language": "en",
        "stt_mode": "transcribe",
        "llm_model": "openai/gpt-4.1-nano",
        "tts_model": "xai/tts-1",
        "tts_voice": "Ara",
        "tts_language": "multi",
        "turn_detection": "multilingual",
        "min_endpointing_delay": 0.28,
        "greeting_instruction": (
            "Greet the person naturally in English in one short sentence. Say you are Riya "
            "from Progressive AI, briefly mention you are calling to introduce voice agents "
            "and AI automations for businesses, and ask if now is a good time to talk. "
            "Do not sound scripted."
        ),
        "prompt": _build_prompt("Speak in English by default unless the user clearly speaks another language first."),
        "background_audio": DEFAULT_BACKGROUND_AUDIO,
        "background_volume": DEFAULT_BACKGROUND_VOLUME,
    },
    "hindi": {
        "label": "Hindi",
        "language_label": "Hindi",
        "language_prompt_line": "Speak in Hindi or natural Hinglish by default unless the user clearly speaks English first.",
        "stt_model": "cartesia/ink-whisper",
        "stt_language": "hi",
        "stt_mode": "transcribe",
        "llm_model": "openai/gpt-4o-mini",
        "tts_model": "inworld/inworld-tts-1.5-mini",
        "tts_voice": "Riya",
        "tts_language": "hi-IN",
        "turn_detection": "multilingual",
        "min_endpointing_delay": 0.28,
        "greeting_instruction": (
            "Greet the person naturally in Hindi or natural Hinglish in one short sentence. Say you are Riya "
            "from Progressive AI, briefly mention that you are calling to introduce voice agents "
            "and AI automations for businesses, and ask if now is a good time to talk. "
            "Keep the tone warm, respectful, and natural. Do not sound scripted."
        ),
        "prompt": _build_prompt("Speak in Hindi or natural Hinglish by default unless the user clearly speaks English first."),
        "background_audio": DEFAULT_BACKGROUND_AUDIO,
        "background_volume": DEFAULT_BACKGROUND_VOLUME,
    },
    "hindi_x": {
        "label": "Hindi X",
        "language_label": "Hindi",
        "language_prompt_line": "Speak in Hindi or natural Hinglish by default unless the user clearly speaks English first.",
        "stt_model": "cartesia/ink-whisper",
        "stt_language": "hi",
        "stt_mode": "transcribe",
        "llm_model": "openai/gpt-4o-mini",
        "tts_model": "xai/tts-1",
        "tts_voice": "Ara",
        "tts_language": "multi",
        "turn_detection": "multilingual",
        "min_endpointing_delay": 0.28,
        "greeting_instruction": (
            "Greet the person naturally in Hindi or natural Hinglish in one short sentence. Say you are Riya "
            "from Progressive AI, briefly mention that you are calling to introduce voice agents "
            "and AI automations for businesses, and ask if now is a good time to talk. "
            "Keep the tone warm, respectful, and natural. Do not sound scripted."
        ),
        "prompt": _build_prompt("Speak in Hindi or natural Hinglish by default unless the user clearly speaks English first."),
        "background_audio": DEFAULT_BACKGROUND_AUDIO,
        "background_volume": DEFAULT_BACKGROUND_VOLUME,
    },
    "bengali": {
        "label": "Bengali",
        "language_label": "Bengali",
        "language_prompt_line": "Speak in Bengali by default unless the user clearly speaks English first.",
        "stt_model": "saaras:v3",
        "stt_language": "unknown",
        "stt_mode": "translate",
        "llm_model": "openai/gpt-4o-mini",
        "tts_model": "xai/tts-1",
        "tts_voice": "Ara",
        "tts_language": "multi",
        "turn_detection": "none",
        "min_endpointing_delay": 0.15,
        "greeting_instruction": (
            "Greet the person naturally in Bengali in one short sentence. Say you are Riya "
            "from Progressive AI, briefly mention that you are calling to introduce voice agents "
            "and AI automations for businesses, and ask if now is a good time to talk. "
            "Keep the tone warm, respectful, and natural. Do not sound scripted."
        ),
        "prompt": _build_prompt("Speak in Bengali by default unless the user clearly speaks English first."),
        "background_audio": DEFAULT_BACKGROUND_AUDIO,
        "background_volume": DEFAULT_BACKGROUND_VOLUME,
    },
    "multi": {
        "label": "Multi",
        "language_label": "Bengali / English / Hindi",
        "language_prompt_line": "Speak casually. Start in Bengali by default, and adapt naturally to English or Hindi when the user does. Stay within Bengali, English, or Hindi only.",
        "stt_model": "saaras:v3",
        "stt_language": "unknown",
        "stt_mode": "codemix",
        "llm_model": "openai/gpt-4o-mini",
        "tts_model": "xai/tts-1",
        "tts_voice": "Ara",
        "tts_language": "multi",
        "turn_detection": "none",
        "min_endpointing_delay": 0.15,
        "greeting_instruction": (
            "Greet the person naturally in Bengali in one short sentence. Say you are Riya "
            "from Progressive AI, briefly mention that you are calling to introduce voice agents "
            "and AI automations for businesses, and ask if now is a good time to talk. "
            "Keep the tone warm, respectful, and natural. Do not sound scripted. "
            "If the user responds in English or Hindi, adapt naturally."
        ),
        "prompt": _build_prompt("Speak casually. Start in Bengali by default, and adapt naturally to English or Hindi when the user does. Stay within Bengali, English, or Hindi only."),
        "background_audio": DEFAULT_BACKGROUND_AUDIO,
        "background_volume": DEFAULT_BACKGROUND_VOLUME,
    },
}
PRESET_ALIASES = {
    "hindi_default": "default",
}


def _resolve_preset_name(preset_name: str | None) -> str:
    normalized = _coerce_text(preset_name) or DEFAULT_SESSION_PRESET_NAME
    return PRESET_ALIASES.get(normalized, normalized)


def _normalize_prompt_for_preset(preset: dict, prompt: str | None) -> str:
    source = (prompt or preset["prompt"]).strip()
    body = "\n".join(source.splitlines()[2:]).strip()
    return _build_prompt(preset["language_prompt_line"], body or None)


DEFAULT_SESSION_PRESET_NAME = "default"
ACTIVE_SESSION_PRESET_NAME = _resolve_preset_name(os.getenv("AGENT_PRO_SESSION_PRESET", DEFAULT_SESSION_PRESET_NAME))
ACTIVE_SESSION_PRESET = SESSION_PRESETS.get(ACTIVE_SESSION_PRESET_NAME, SESSION_PRESETS[DEFAULT_SESSION_PRESET_NAME])
PERSONA_PROMPT = os.getenv("AGENT_PRO_PROMPT", ACTIVE_SESSION_PRESET["prompt"])

logger.info(f"SUPABASE CONFIG: URL={SUPABASE_URL}, KEY_LEN={len(SUPABASE_KEY) if SUPABASE_KEY else 0}")
logger.info(f"CURRENT DIR: {os.getcwd()}")
logger.info(f"ENV FILES: .env={os.path.exists('.env')}, call-manager/.env.local={os.path.exists('call-manager/.env.local')}")

supabase: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
else:
    logger.warning("Supabase credentials missing. Call logging will be disabled.")


class DefaultAgent(Agent):
    def __init__(self, instructions: str | None = None) -> None:
        super().__init__(
            instructions=instructions or PERSONA_PROMPT,
        )

    async def on_enter(self):
        pass


def _extract_agent_payload(job_metadata: str | None) -> dict:
    if not job_metadata:
        return {}
    try:
        parsed = json.loads(job_metadata)
        if isinstance(parsed, dict):
            return parsed
    except Exception as exc:
        logger.warning(f"Failed to parse job metadata as JSON: {exc}")
    return {}


def _is_web_test_job(metadata: dict) -> bool:
    source = _coerce_text(metadata.get("source"))
    test_mode = metadata.get("test_mode")
    return source == "web-test" or test_mode is True


async def _wait_for_remote_participant(ctx: JobContext, timeout_seconds: float = 20.0) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if ctx.room.remote_participants:
            return True
        await asyncio.sleep(0.25)
    return False


def _resolve_runtime_config(metadata: dict) -> dict:
    agent_config = metadata.get("agent_config") or metadata.get("agentConfig")
    if not isinstance(agent_config, dict):
        agent_config = {}

    preset_name = _resolve_preset_name(
        metadata.get("preset_id")
        or metadata.get("presetId")
        or metadata.get("agent_preset_id")
        or metadata.get("agentPresetId")
        or agent_config.get("preset_id")
        or agent_config.get("presetId")
        or agent_config.get("agent_preset_id")
        or agent_config.get("agentPresetId")
    )

    preset = SESSION_PRESETS.get(preset_name, SESSION_PRESETS[DEFAULT_SESSION_PRESET_NAME])

    resolved = {
        "preset_id": preset_name if preset_name in SESSION_PRESETS else DEFAULT_SESSION_PRESET_NAME,
        "label": preset["label"],
        "language_label": preset["language_label"],
        "stt_model": _coerce_text(
            agent_config.get("stt_model")
            or agent_config.get("sttModel")
            or preset["stt_model"]
        ) or preset["stt_model"],
        "stt_language": _coerce_text(
            agent_config.get("stt_language")
            or agent_config.get("sttLanguage")
            or preset["stt_language"]
        ) or preset["stt_language"],
        "stt_mode": _coerce_text(
            agent_config.get("stt_mode")
            or agent_config.get("sttMode")
            or preset["stt_mode"]
        ) or preset["stt_mode"],
        "llm_model": _coerce_text(
            agent_config.get("llm_model")
            or agent_config.get("llmModel")
            or preset["llm_model"]
        ) or preset["llm_model"],
        "tts_model": _coerce_text(
            agent_config.get("tts_model")
            or agent_config.get("ttsModel")
            or preset["tts_model"]
        ) or preset["tts_model"],
        "tts_voice": _coerce_text(
            agent_config.get("tts_voice")
            or agent_config.get("ttsVoice")
            or preset["tts_voice"]
        ) or preset["tts_voice"],
        "tts_language": _coerce_text(
            agent_config.get("tts_language")
            or agent_config.get("ttsLanguage")
            or preset["tts_language"]
        ) or preset["tts_language"],
        "turn_detection": _coerce_text(
            agent_config.get("turn_detection")
            or agent_config.get("turnDetection")
            or preset["turn_detection"]
        ) or preset["turn_detection"],
        "min_endpointing_delay": (
            agent_config.get("min_endpointing_delay")
            if isinstance(agent_config.get("min_endpointing_delay"), (int, float))
            else agent_config.get("minEndpointingDelay")
            if isinstance(agent_config.get("minEndpointingDelay"), (int, float))
            else preset["min_endpointing_delay"]
        ),
        "prompt": _coerce_text(
            agent_config.get("prompt")
            or agent_config.get("instructions")
            or preset["prompt"]
        ) or preset["prompt"],
        "greeting_instruction": _coerce_text(
            agent_config.get("greeting_instruction")
            or agent_config.get("greetingInstruction")
            or preset["greeting_instruction"]
        ) or preset["greeting_instruction"],
        "background_audio": DEFAULT_BACKGROUND_AUDIO,
        "background_volume": DEFAULT_BACKGROUND_VOLUME,
    }
    if resolved["preset_id"] not in SESSION_PRESETS:
        resolved["preset_id"] = DEFAULT_SESSION_PRESET_NAME
    resolved["prompt"] = _normalize_prompt_for_preset(preset, resolved["prompt"])
    return resolved


def _build_agent_session(ctx: JobContext, runtime_config: dict) -> AgentSession:
    if runtime_config["preset_id"] in {"bengali", "multi"}:
        if sarvam is None:
            raise RuntimeError(
                f"{runtime_config['preset_id'].title()} preset requires the livekit-plugins-sarvam package. Install it and set SARVAM_API_KEY."
            )

        sarvam_api_key = os.getenv("SARVAM_API_KEY")
        if not sarvam_api_key:
            raise RuntimeError(f"{runtime_config['preset_id'].title()} preset requires SARVAM_API_KEY.")

        sarvam_stt = sarvam.STT(
            api_key=sarvam_api_key,
            language=runtime_config["stt_language"],
            model=runtime_config["stt_model"],
            mode=runtime_config.get("stt_mode", "translate"),
        )

        return AgentSession(
            vad=ctx.proc.userdata["vad"],
            stt=sarvam_stt,
            llm=inference.LLM(model=runtime_config["llm_model"]),
            tts=inference.TTS(
                model=runtime_config["tts_model"],
                voice=runtime_config["tts_voice"],
                language=runtime_config["tts_language"],
            ),
            preemptive_generation=True,
            min_endpointing_delay=runtime_config["min_endpointing_delay"],
        )

    session_kwargs = {
        "vad": ctx.proc.userdata["vad"],
        "stt": inference.STT(
            model=runtime_config["stt_model"],
            language=runtime_config["stt_language"],
        ),
        "llm": inference.LLM(model=runtime_config["llm_model"]),
        "tts": inference.TTS(
            model=runtime_config["tts_model"],
            voice=runtime_config["tts_voice"],
            language=runtime_config["tts_language"],
        ),
        "preemptive_generation": True,
    }
    if runtime_config["turn_detection"] == "multilingual":
        session_kwargs["turn_detection"] = MultilingualModel()

    return AgentSession(**session_kwargs)


def _build_background_audio(runtime_config: dict) -> BackgroundAudioPlayer | None:
    background_audio = runtime_config.get("background_audio")
    if not background_audio:
        return None

    background_volume = runtime_config.get("background_volume")
    if not isinstance(background_volume, (int, float)):
        background_volume = DEFAULT_BACKGROUND_VOLUME

    return BackgroundAudioPlayer(
        ambient_sound=AudioConfig(
            background_audio,
            volume=float(background_volume),
        )
    )


server = AgentServer(shutdown_process_timeout=60.0)


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


class PerformanceTracker:
    def __init__(self):
        self.user_stopped_speaking = 0
        self.transcript_received = 0
        self.llm_first_chunk = 0

    def reset(self):
        self.user_stopped_speaking = time.perf_counter()
        self.transcript_received = 0
        self.llm_first_chunk = 0


class CallTelemetry:
    def __init__(self):
        self.messages = []
        self.metrics = []
        self.events = []
        self.important_events = []
        self.started_at = time.time()
        self.updated_at = None

    def snapshot(self):
        return {
            "messages": self.messages,
            "metrics": self.metrics,
            "events": self.events,
            "important_events": self.important_events,
            "started_at": self.started_at,
            "updated_at": self.updated_at,
        }


def _serialize_chat_history(chat_ctx: ChatContext) -> list[dict]:
    messages: list[dict] = []
    for item in chat_ctx.items:
        if item.type != "message":
            continue
        if item.role not in ("user", "assistant"):
            continue
        if getattr(item, "extra", {}).get("is_summary") is True:
            continue

        text = (item.text_content or "").strip()
        if text:
            messages.append({"role": item.role, "content": text})
    return messages


def _infer_phone_number(ctx: JobContext, metadata_phone_number: str | None) -> str | None:
    phone_number = _coerce_text(metadata_phone_number)
    if phone_number:
        return phone_number

    for identity, participant in ctx.room.remote_participants.items():
        attributes = participant.attributes or {}
        if not isinstance(attributes, dict):
            continue
        phone_number = _coerce_text(attributes.get("sip.phoneNumber") or attributes.get("phoneNumber"))
        if phone_number:
            return phone_number
        if isinstance(identity, str) and "sip_" in identity:
            return identity.replace("sip_", "")

    return None


async def _resolve_call_record_id(
    *,
    phone_number: str | None,
    room_name: str,
    call_id: str | None = None,
) -> str | None:
    if not supabase:
        return None

    phone_number = _coerce_text(phone_number)
    room_name = _coerce_text(room_name)
    call_id = _coerce_text(call_id)
    if not room_name:
        return None

    def _do_lookup_or_create() -> str | None:
        if call_id:
            existing = supabase.table("calls").select("id").eq("id", call_id).limit(1).execute()
            if existing.data:
                return existing.data[0]["id"]

        existing = supabase.table("calls").select("id").eq("livekit_room_name", room_name).limit(1).execute()
        if existing.data:
            return existing.data[0]["id"]

        if not phone_number:
            return None

        inserted = supabase.table("calls").insert(
            {
                "phone_number": phone_number,
                "status": "in_progress",
                "livekit_room_name": room_name,
            }
        ).execute()
        if inserted.data:
            return inserted.data[0]["id"]
        return None

    return await asyncio.to_thread(_do_lookup_or_create)


async def _summarize_session(chat_ctx: ChatContext) -> str | None:
    summary_lines: list[str] = []
    n_summarized = 0
    for item in chat_ctx.items:
        if item.type != "message":
            continue
        if item.role not in ("user", "assistant"):
            continue
        if getattr(item, "extra", {}).get("is_summary") is True:
            continue

        text = (item.text_content or "").strip()
        if text:
            summary_lines.append(f"{item.role.title()}: {text}")
            n_summarized += 1

    if n_summarized == 0:
        return None

    summary_ctx = ChatContext()
    summary_ctx.add_message(
        role="system",
        content=(
            "Summarize the transcript below in a concise, business-friendly way. "
            "Use only the transcript content. Do not repeat the last line as the summary. "
            "Do not mention that you are summarizing. Return a clean summary paragraph or short bullets."
        ),
    )
    summary_ctx.add_message(role="user", content="\n".join(summary_lines).strip())

    summarizer = inference.LLM(model="openai/gpt-4o-mini")
    response = await summarizer.chat(chat_ctx=summary_ctx).collect()
    return response.text.strip() if response.text else None


async def _persist_call_summary(ctx: JobContext) -> None:
    session = ctx._primary_agent_session
    if not session:
        logger.error("No primary agent session found for summary persistence.")
        return

    report = ctx.make_session_report()
    telemetry: CallTelemetry | None = ctx.proc.userdata.get("telemetry")
    summary_source = ChatContext()
    if telemetry and telemetry.messages:
        for message in telemetry.messages:
            role = message.get("role")
            content = (message.get("content") or "").strip()
            if role in ("user", "assistant") and content:
                summary_source.add_message(role=role, content=content)
    else:
        summary_source = report.chat_history
    summary = await _summarize_session(summary_source)

    call_id = _coerce_text(ctx.proc.userdata.get("call_id"))
    phone_number = _coerce_text(ctx.proc.userdata.get("phone_number"))
    call_record_id = ctx.proc.userdata.get("call_record_id")

    if not call_record_id:
        call_record_id = await _resolve_call_record_id(
            phone_number=phone_number,
            room_name=report.room,
            call_id=call_id,
        )
        if call_record_id:
            ctx.proc.userdata["call_record_id"] = call_record_id

    if not supabase or not call_record_id:
        logger.warning("Skipping Supabase summary write because the call row could not be resolved.")
        return

    final_status = ctx.proc.userdata.get("final_status", "completed")
    duration_seconds = 0
    if report.started_at:
        duration_seconds = max(0, int(datetime.now(timezone.utc).timestamp() - report.started_at))

    final_snapshot = telemetry.snapshot() if telemetry else {}
    final_snapshot.update(
        {
            "summary": summary,
            "job_id": report.job_id,
            "room_id": report.room_id,
            "room": report.room,
            "started_at": datetime.fromtimestamp(report.started_at, timezone.utc).isoformat().replace("+00:00", "Z")
            if report.started_at
            else None,
            "ended_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "messages": telemetry.messages if telemetry else _serialize_chat_history(report.chat_history),
            "chat_history": _serialize_chat_history(report.chat_history),
        }
    )

    def _do_update():
        return (
            supabase.table("calls")
            .update(
                {
                    "status": final_status,
                    "duration_seconds": duration_seconds,
                    "transcript": final_snapshot,
                }
            )
            .eq("id", call_record_id)
            .execute()
        )

    try:
        await asyncio.to_thread(_do_update)
        logger.info(f"Stored summary for call row {call_record_id}.")
    except Exception as e:
        logger.error(f"Failed to persist summary: {e}")


async def _on_session_end(ctx: JobContext) -> None:
    await _persist_call_summary(ctx)


@server.rtc_session(agent_name="outbound-caller", on_session_end=_on_session_end)
async def entrypoint(ctx: JobContext):
    logger.info(f"--- ENTRYPOINT START: {ctx.job.id} ---")

    performance = PerformanceTracker()
    telemetry = CallTelemetry()
    ctx.proc.userdata["telemetry"] = telemetry
    ctx.proc.userdata["final_status"] = "completed"

    def append_message(role: str, content: str):
        telemetry.messages.append(
            {
                "type": "message",
                "role": role,
                "content": content,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    def append_metric(event_name: str, metrics_obj, *, stage: Optional[str] = None, latency_ms: Optional[float] = None):
        telemetry.metrics.append(
            {
                "type": "metric",
                "event_name": event_name,
                "stage": stage,
                "latency_ms": latency_ms,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "metrics": _json_safe(metrics_obj),
            }
        )

    def append_event(event_name: str, *, stage: Optional[str] = None, latency_ms: Optional[float] = None, payload=None):
        telemetry.events.append(
            {
                "type": "event",
                "event_name": event_name,
                "stage": stage,
                "latency_ms": latency_ms,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "payload": _json_safe(payload),
            }
        )

    def append_important_event(event_name: str, *, payload=None):
        telemetry.important_events.append(
            {
                "type": "important_event",
                "event_name": event_name,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "payload": _json_safe(payload),
            }
        )

    def publish_room_event(event_type: str, data: dict):
        payload = json.dumps({"type": event_type, **data}, ensure_ascii=False)
        try:
            ctx.room.local_participant.publish_data(payload.encode("utf-8"))
        except Exception as e:
            logger.warning(f"Publish room event failed for {event_type}: {e}")

    logger.info(f"JOB RECEIVED: ID={ctx.job.id} | Metadata={ctx.job.metadata}")

    metadata = _extract_agent_payload(ctx.job.metadata)
    phone_number = _coerce_text(metadata.get("phone_number"))
    call_id = _coerce_text(metadata.get("call_id"))
    is_web_test = _is_web_test_job(metadata)
    runtime_config = _resolve_runtime_config(metadata)
    ctx.proc.userdata["agent_runtime_config"] = runtime_config
    logger.info(f"PARSED METADATA: Phone={phone_number}, CallID={call_id}")
    logger.info(f"WEB TEST MODE: {is_web_test}")
    logger.info(f"RESOLVED AGENT CONFIG: {json.dumps(_json_safe(runtime_config), ensure_ascii=False)}")
    append_important_event("agent_runtime_config", payload=runtime_config)

    phone_number = _infer_phone_number(ctx, phone_number)
    if phone_number:
        ctx.proc.userdata["phone_number"] = phone_number
    if call_id:
        ctx.proc.userdata["call_id"] = call_id

    if supabase:
        call_record_id = await _resolve_call_record_id(
            phone_number=phone_number,
            room_name=ctx.room.name,
            call_id=call_id,
        )
        if call_record_id:
            ctx.proc.userdata["call_record_id"] = call_record_id
            append_important_event("call_record_resolved", payload={"call_id": call_record_id, "room": ctx.room.name})
            try:
                await asyncio.to_thread(
                    lambda: supabase.table("calls")
                    .update({"status": "in_progress", "livekit_room_name": ctx.room.name})
                    .eq("id", call_record_id)
                    .execute()
                )
            except Exception as e:
                logger.warning(f"Failed to mark call row in_progress: {e}")

    room_options = room_io.RoomOptions(
        audio_input=room_io.AudioInputOptions(
            noise_cancellation=lambda params: noise_cancellation.BVCTelephony()
            if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
            else noise_cancellation.BVC(),
        ),
    )
    session = _build_agent_session(ctx, runtime_config)

    @session.on("user_state_changed")
    def on_user_state_changed(state):
        if state.old_state == "speaking" and state.new_state == "listening":
            performance.user_stopped_speaking = time.perf_counter()
            logger.info("VAD: User stopped speaking")
            append_event("user_stopped_speaking", stage="turn_boundary")

    @session.on("user_input_transcribed")
    def on_user_input_transcribed(ev):
        if not ev.is_final:
            return

        transcript = (ev.transcript or "").strip()
        if not transcript:
            return

        performance.transcript_received = time.perf_counter()
        stt_latency = (
            (performance.transcript_received - performance.user_stopped_speaking) * 1000
            if performance.user_stopped_speaking > 0
            else None
        )
        logger.info(f"STT: Received transcript: '{transcript}'")
        if stt_latency is not None:
            logger.info(f"LATENCY: STT: {stt_latency:.2f}ms")
        append_message("user", transcript)
        append_event("user_transcript", stage="stt", latency_ms=stt_latency, payload={"text": transcript})
        append_important_event("user_transcript", payload={"text": transcript})
        publish_room_event("user_transcript", {"text": transcript})

    @session.on("conversation_item_added")
    def on_conversation_item_added(ev):
        item = ev.item
        if getattr(item, "type", None) != "message":
            return
        if getattr(item, "role", None) != "assistant":
            return

        transcript = (getattr(item, "text_content", None) or "").strip()
        if not transcript:
            return

        if performance.llm_first_chunk == 0:
            performance.llm_first_chunk = time.perf_counter()
            llm_latency = (
                (performance.llm_first_chunk - performance.transcript_received) * 1000
                if performance.transcript_received > 0
                else None
            )
            total_turnaround = (
                (performance.llm_first_chunk - performance.user_stopped_speaking) * 1000
                if performance.user_stopped_speaking > 0
                else None
            )
            if llm_latency is not None and total_turnaround is not None:
                logger.info(f"LATENCY: LLM: {llm_latency:.2f}ms | Total: {total_turnaround:.2f}ms")
            append_event("agent_first_chunk", stage="llm", latency_ms=llm_latency, payload={"text": transcript})

        append_message("assistant", transcript)
        append_important_event("assistant_transcript", payload={"text": transcript})
        publish_room_event("agent_transcript", {"text": transcript})

    @session.on("metrics_collected")
    def on_metrics_collected(ev: MetricsCollectedEvent):
        metrics_obj = ev.metrics
        metric_type = type(metrics_obj).__name__ if metrics_obj is not None else "unknown"
        append_metric(metric_type, metrics_obj)

    @session.on("agent_state_changed")
    def on_state_changed(state: AgentStateChangedEvent):
        logger.info(f"STATE: Agent is now {state.new_state}")

    await session.start(
        agent=DefaultAgent(instructions=runtime_config["prompt"]),
        room=ctx.room,
        room_options=room_options,
    )

    ambient_audio = _build_background_audio(runtime_config)
    try:
        if ambient_audio is not None:
            await ambient_audio.start(room=ctx.room, agent_session=session)
            ctx.proc.userdata["background_audio"] = ambient_audio
            logger.info(
                f"Background audio started for preset {runtime_config['preset_id']} at volume {runtime_config['background_volume']}."
            )
    except Exception as e:
        logger.warning(f"Failed to start background ambience: {e}")

    if phone_number:
        logger.info(f"Initiating outbound SIP call to {phone_number}...")
        append_important_event("outbound_dial", payload={"phone_number": phone_number, "room": ctx.room.name})
        try:
            await ctx.api.sip.create_sip_participant(
                api.CreateSIPParticipantRequest(
                    room_name=ctx.room.name,
                    sip_trunk_id=OUTBOUND_TRUNK_ID,
                    sip_call_to=phone_number,
                    participant_identity=f"sip_{phone_number}",
                    wait_until_answered=True,
                )
            )
            logger.info("Call answered. Generating a natural greeting.")
            append_important_event("call_answered", payload={"phone_number": phone_number})
            await session.generate_reply(
                instructions=runtime_config["greeting_instruction"],
                allow_interruptions=True,
            )
        except Exception as e:
            logger.error(f"Failed to place outbound call: {e}")
            ctx.proc.userdata["final_status"] = "failed"
            append_important_event("call_failed", payload={"error": str(e)})
            if supabase and ctx.proc.userdata.get("call_record_id"):
                try:
                    await asyncio.to_thread(
                        lambda: supabase.table("calls")
                        .update({"status": "failed"})
                        .eq("id", ctx.proc.userdata["call_record_id"])
                        .execute()
                    )
                except Exception as update_error:
                    logger.warning(f"Failed to mark call row failed: {update_error}")
            ctx.shutdown()
    else:
        logger.info("Inbound/Web call detected. Generating a natural greeting.")
        if is_web_test:
            logger.info("Web test detected; waiting briefly for the browser participant before greeting.")
            browser_ready = await _wait_for_remote_participant(ctx, timeout_seconds=20.0)
            if browser_ready:
                logger.info("Browser participant connected; sending greeting now.")
            else:
                logger.warning("Browser participant did not connect in time; sending greeting anyway.")
        await session.generate_reply(
            instructions=runtime_config["greeting_instruction"],
            allow_interruptions=True,
        )

    if hasattr(ctx, "wait_until_closing"):
        await ctx.wait_until_closing()
    else:
        while hasattr(ctx, "room") and hasattr(ctx.room, "is_connected") and ctx.room.is_connected():
            await asyncio.sleep(1)


if __name__ == "__main__":
    cli.run_app(server)
