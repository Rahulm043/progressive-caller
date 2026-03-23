# LiveKit Vobiz Outbound

Outbound AI calling stack for LiveKit SIP trunks and Vobiz telephony. The main agent can accept dispatch jobs, place outbound calls, and manage the conversation once the callee answers.

## Project Structure

- `agent.py` - primary outbound worker.
- `agent_pro.py` - current preset-driven worker used by the deployment and dashboard.
- `make_call.py` - helper to dispatch a single call.
- `run_campaign.py` - queue-driven campaign runner backed by Supabase.
- `setup_trunk.py` - trunk setup helper for LiveKit and Vobiz.
- `transfer_call.md` - SIP transfer notes and troubleshooting.
- `call-manager/`, `InboundAIVoice/`, `progressive-ai/` - related project folders.

## Setup

### Prerequisites

- Python 3.9 or newer
- `uv` for environment and dependency management
- LiveKit Cloud, Vobiz SIP, OpenAI, and Deepgram credentials

### Install

```powershell
uv venv
uv pip install -r requirements.txt
```

### Configure

Set your secrets in `.env` or `.env.local`:

```env
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
OPENAI_API_KEY=...
DEEPGRAM_API_KEY=...
VOBIZ_SIP_DOMAIN=...
VOBIZ_USERNAME=...
VOBIZ_PASSWORD=...
VOBIZ_OUTBOUND_NUMBER=+91...
```

Update `OUTBOUND_TRUNK_ID` in `agent.py` after you create the trunk.

## Run

Start the worker in one terminal:

```powershell
uv run python agent_pro.py start
```

Place a call from another terminal:

```powershell
uv run python make_call.py --to +919988776655
```

Run the campaign loop when using Supabase-backed call queues:

```powershell
uv run python run_campaign.py
```

## Campaign Backend Runtime Model

- `run_campaign.py` is the queue worker. It must stay running in the background for queued/scheduled calls to continue when the frontend is closed.
- Recommended runtime model in production:
  1. `agent_pro.py start` (LiveKit agent worker)
  2. `run_campaign.py` (queue + schedule dispatcher)
  3. `call-manager` frontend (optional operator UI)
- Queue semantics:
  - `mode=now` can dispatch immediately (single call flow).
  - `mode=queue` inserts as `queued` and is picked by `run_campaign.py`.
- Campaign states are reconciled from call outcomes (`scheduled`, `running`, `completed`, `failed`), and paused campaigns are skipped by the queue worker.

## Troubleshooting

- Confirm the worker is running before dispatching a call.
- Verify the trunk ID, SIP credentials, and destination number format.
- If audio fails, recheck OpenAI and Deepgram keys.
- See `transfer_call.md` for transfer-specific setup.
