# Repository Guidelines

## Project Structure & Module Organization
This repository is a LiveKit-based outbound calling stack with a Python worker at the repo root and a Next.js control plane in `call-manager/`.

- `agent_pro.py` is the primary worker for the current preset-driven agent.
- `agent.py`, `agent3.py`, `agent4.py`, `agent_zero.py`, and `agent_sukanya.py` are older or alternate worker entry points. Treat them as separate variants unless the user explicitly asks to change them.
- `make_call.py` dispatches a single outbound call.
- `run_campaign.py` polls Supabase for queued calls.
- `call-manager/` contains the dashboard, agent settings UI, and the frontend web-test flow.
- `InboundAIVoice/`, `KMS/`, `progressive-ai/`, and `supabase/` are supporting modules and should be edited independently unless the request spans them.

Keep generated files, local virtual environments, and secrets out of version control.

## Build, Test, and Development Commands
Use `uv` for the Python worker and `npm` for the dashboard.

```powershell
uv venv --python 3.12
uv pip install -r requirements.txt
uv run python agent_pro.py start
uv run python make_call.py --to +919988776655
uv run python run_campaign.py
```

For the dashboard:

```powershell
cd call-manager
npm run dev
npm run lint
```

Notes:
- The repo's current `.venv` should point at Python 3.12. If it points at Python 3.11, rebuild it with `uv venv --python 3.12 --clear`.
- `agent_pro.py start` is the current worker path for preset-based testing.
- The web-test path uses the LiveKit room and token route in `call-manager`, not SIP telephony minutes.
- If `uv` is using a stale cache or broken interpreter path, set `UV_CACHE_DIR` to a repo-local folder before reinstalling packages.

## Current Agent Architecture
`agent_pro.py` is preset-driven and should remain explicit and easy to audit.

- The supported presets are `default`, `english_x`, `hindi`, `hindi_x`, `bengali`, and `multi`.
- The default preset is English and is the fallback when no preset metadata is supplied.
- The worker resolves preset data from dispatch metadata. Preserve compatibility for both top-level `preset_id` and nested `agent_config.presetId`.
- Keep `AgentSession` construction literal and readable. Avoid hidden model switching, implicit environment-based preset swapping, or indirect model lookup.

Preset expectations:
- `default`: English STT, `openai/gpt-4.1-nano`, `inworld/inworld-tts-1.5-mini`, `Riya`
- `english_x`: English STT, `openai/gpt-4.1-nano`, `xai/tts-1`, `Ara`
- `hindi`: Hindi STT, `openai/gpt-4o-mini`, `inworld/inworld-tts-1.5-mini`, `Riya`
- `hindi_x`: Hindi STT, `openai/gpt-4o-mini`, `xai/tts-1`, `Ara`
- `bengali`: Bengali STT via Sarvam, `openai/gpt-4o-mini`, `xai/tts-1`, `Ara`
- `bengali` currently uses Sarvam Saaras v3 with translation mode in the worker and dashboard presets.
- `multi`: Sarvam Saaras v3 with codemix mode, `openai/gpt-4o-mini`, `xai/tts-1`, `Ara`

Rules for Bengali:
- Bengali must use `sarvam.STT(...)` directly.
- Do not silently fall back to `livekit.agents.inference.STT` for Bengali.
- Bengali requires both the `livekit-plugins-sarvam` package and `SARVAM_API_KEY`.
- Use `model="saaras:v3"` and `mode="translate"` for the Bengali Sarvam path.
- If Sarvam is missing, fail loudly and clearly so the issue is obvious in logs.
- Bengali should not use the multilingual end-of-utterance path. Use endpointing and VAD behavior appropriate for the preset.
- The `multi` preset also uses Sarvam Saaras v3 directly. It should stay within Bengali, English, and Hindi only, and use `mode="codemix"` for mixed-script speech.

Current runtime notes:
- The worker logs the resolved preset and the effective agent config at job start. Use those logs to verify the actual session stack before assuming the frontend is wrong.
- If a preset is selected in the dashboard but the worker still resolves `default`, check both the top-level `preset_id` and the nested `agent_config.presetId` path.
- The dashboard can persist the selected preset and prompt locally, so stale browser state can make the UI look wrong even when the worker is correct.

## Background Audio
Background office ambience is part of the worker now, not a frontend toggle.

- The worker should start office ambience after `session.start(...)`.
- Current behavior uses `BuiltinAudioClip.OFFICE_AMBIENCE` as the default ambient clip.
- The current implementation follows the LiveKit sample pattern:
  - construct `BackgroundAudioPlayer(ambient_sound=AudioConfig(BuiltinAudioClip.OFFICE_AMBIENCE, volume=1.0))`
  - call `await background_audio.start(room=ctx.room, agent_session=session)` after `session.start(...)`
- The ambience volume is intentionally controlled in `agent_pro.py`; keep it high enough to be audible in both SIP and web-test calls.
- If you change the ambience behavior, update the worker first. The frontend does not own the audio mix.

When testing background audio:
- Use a fresh room or fresh call. Existing sessions will not reliably pick up a changed ambience source or volume.
- Check the worker logs for the background audio start message.
- If ambience is still silent at normal volume, test with a different clip before assuming the pipeline is broken.
- If `BuiltinAudioClip.OFFICE_AMBIENCE` is silent even at `volume=1.0`, the likely cause is room playback or subscription, browser output routing, or the clip itself rather than the preset system.
- The practical debugging sequence is:
  1. confirm the worker starts the ambient track
  2. confirm the web room is actually joined
  3. swap to a louder clip such as typing before changing the worker architecture

## Dashboard and Web Test Path
`call-manager/` is the operator console for preset selection and web testing.

- `call-manager/src/app/page.tsx` persists the selected agent config to `localStorage`.
- If the dashboard looks stale, clear the browser storage key used by the agent settings before assuming the worker is wrong.
- `call-manager/src/app/api/outbound/route.ts` is for telephony dispatch.
- `call-manager/src/app/api/token/route.ts` is the frontend test path. It creates a LiveKit room token and dispatches the same agent to a `web-test-*` room.
- `NEXT_PUBLIC_LIVEKIT_URL` must be set for the web-test dialog to connect.
- The frontend web-test path should be treated as a separate test harness, not a replacement for SIP telephony dispatch.
- If the web test connects but the agent config looks wrong in logs, inspect the metadata payload first rather than the LiveKit connection.

## Coding Style & Naming Conventions
Follow standard Python 3 style:

- 4-space indentation
- `snake_case` for functions and variables
- `PascalCase` for classes such as `DefaultAgent`

Prefer small helper functions over large inline blocks. Keep imports grouped logically. There is no formatter enforced at the repo root, so match the existing style.

For the Next.js app:

- Keep React component props explicit and typed.
- Avoid unnecessary abstraction in the dashboard. The settings flow should stay straightforward.
- Keep the web-test path isolated from the SIP dispatch path.

## Testing Guidelines
There is no formal automated test suite for the Python worker.

Before opening a PR:

- Run the relevant worker command and confirm the worker registers successfully.
- Verify the logs show the resolved preset, the agent session start, and any background-audio start message.
- For Bengali, confirm the worker uses Sarvam and does not fall back to LiveKit Inference STT.
- For the dashboard, run `npm run lint` in `call-manager/` after touching React or route files.

Good manual checks:

- Outbound SIP call dispatch
- Web-test room join from the dashboard
- Call summary writeback to Supabase
- Background ambience audible in web test and SIP test

## Commit & Pull Request Guidelines
Git history uses short, imperative subjects with occasional conventional prefixes, for example `feat: Initial production setup` and `transfer fix`.

Keep commits focused and descriptive. PRs should explain:

- what changed
- how it was verified
- whether LiveKit, Supabase, SIP, or Sarvam configuration changed
- whether any environment variables or trunk IDs are required

Include relevant log snippets when behavior changes.

## Security & Configuration Tips
Do not commit `.env`, `.env.local`, or `cloud_secrets.env`.

Important environment variables:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `NEXT_PUBLIC_LIVEKIT_URL`
- `SARVAM_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Review `agent.py` and `run_campaign.py` before changing shared environment variable names, since both load credentials at startup.

If the Python environment breaks:

- Recreate the venv with Python 3.12.
- Reinstall `requirements.txt`.
- Do not overwrite an unrelated `.venv` without understanding which worker process is holding it open.

Operational reminders:

- Background audio is owned by the worker. Do not add a separate frontend toggle unless the worker reads it explicitly.
- Bengali is Sarvam-only in the current implementation. Do not route Bengali through LiveKit Inference STT.
- Keep the preset registry and the worker stack in sync. If a preset changes in `call-manager`, update `agent_pro.py` in the same change.
