Campaign & Dashboard Foundation – Implementation Plan (importance-ordered)
=========================================================================

What “done” means
- Clean data model that distinguishes campaigns from call attempts, supports scheduled starts, and snapshots the chosen agent preset/prompt.
- Dashboard that clearly separates live ops vs history, plus campaign-level views with per-call detail.
- Single-call flow that can dial now or enqueue later, sequence-only (no priorities).

Principles
- Schema first, UI second, plumbing third: data contract drives worker and dashboard.
- Reuse existing AgentSettingsPanel/presets; snapshot configs at campaign creation.
- Deterministic queue: smallest `sequence` with `status='queued'` runs first.
- Ship in thin vertical slices; keep current outbound flow working during rollout.

Phase A — Data Model (highest priority)
- Tables
  - `campaigns`: id, name, preset_id, agent_config_snapshot JSONB, starts_at TIMESTAMPTZ NULL, status (`scheduled|running|paused|completed|archived`), created_at, created_by.
  - `call_attempts` (start by extending existing `calls`): sequence BIGINT GENERATED ALWAYS AS IDENTITY, campaign_id UUID NULL, phone_number, status, preset_id, agent_config JSONB, agent_config_snapshot JSONB, livekit_room_name, dispatch_id, transcript, started_at/answered_at/ended_at, duration_seconds, failure_reason, created_at.
- Indexes: `status, sequence` for claim order; `campaign_id, status` for campaign dashboards.
- Migration: idempotent SQL under `supabase/migrations/` to add needed columns to `calls` and create `campaigns`.

Phase B — Worker Claim Logic
- Claim: select smallest `sequence` where `status='queued'` and (campaign.starts_at is null or <= now) and (campaign.status is null or not 'paused'), `FOR UPDATE SKIP LOCKED`.
- Status flow unchanged (`queued` → `dispatching` → `in_progress` → terminal).
- “Call now” insertion: SQL sets `sequence = (SELECT COALESCE(MIN(sequence), 0) - 1 FROM calls WHERE status='queued')` to put the new attempt at the front; default insert uses identity for queueing.

Phase C — APIs
- `/api/outbound`: accept `{ phoneNumber, agentConfig, mode: 'now' | 'queue' }`; compute sequence as above; store preset_id + agent_config + snapshot.
- `/api/campaign`: accept `{ name, startsAt, presetId, agentConfig, phoneNumbers[] }`; create campaign row with snapshot; insert call rows with campaign_id, starts_at, status queued, auto sequence.
- `/api/campaign/:id`: GET for dashboard; POST actions `start_now` (set starts_at=now, status=running) and `pause/resume`.

Phase D — Dashboard IA
- Sections:
  - Campaigns list: cards with name, preset, starts_at (scheduled vs immediate), status, queued/active/completed counts.
  - Campaign detail: snapshot of agent settings (preset/prompt), start time, controls (start now, pause/resume), “Next up” (ordered by sequence), “In progress,” “Completed” with transcript drawer reuse.
  - Live Ops: shows in-progress + next-up across all work.
  - History: completed/failed attempts with filters (campaign, preset, date).
- Single-call modal:
  - If queue empty: only “Call now”.
  - If queue non-empty: “Call now” (front) and “Add to queue” (tail). Uses existing AgentSettingsPanel values.

Phase E — Scheduling Behavior
- Campaign with future `starts_at` stays idle; runner filter respects time.
- “Start now” sets `starts_at` to now and status to running; immediate claiming follows.

Phase F — Observability & Safety
- Runner logs/health: queue depth, head sequence, oldest queued age.
- Mask phone numbers in list views; reveal in detail drawer.
- Replace destructive “Clear logs” with archive policy later (not blocking core delivery).

Execution order (by dependency)
1) Phase A migrations (schema/index), keep compatibility with current `calls`.
2) Phase B worker claim/order + front-of-queue insert logic.
3) Phase C outbound API change (mode) + NewCallModal minimal UX for now/queue.
4) Phase C campaign create API + starts_at support; runner respects starts_at.
5) Phase D campaign list/detail pages (read-only first), reuse transcript drawer.
6) Phase D controls: start now, pause/resume; show “Next up” from sequence.
7) Phase F polish (masking, health logs); retire “clear logs”.

Validation checklist
- “Call now” inserted ahead of existing queued items and dispatches first.
- Scheduled campaign stays idle until start time or start-now action.
- Campaign detail shows accurate counts/transcripts; single-call flow unchanged except mode choice.
- Bengali/Sarvam path unchanged (agent_config snapshot passes through intact).

Out of scope (for now)
- Priority levels, retries, multi-run campaigns, and RLS hardening; tackle after the foundation is stable.
