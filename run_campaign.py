import asyncio
import os
import random
import json
import time
from dotenv import load_dotenv
from livekit import api
from supabase import create_client, Client

# Load environment variables
# Path might be different if running from root vs call-manager, prioritize root .env then call-manager/.env.local
load_dotenv(".env")
if os.path.exists("call-manager/.env.local"):
    load_dotenv("call-manager/.env.local")

# Supabase Setup
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not (SUPABASE_URL and SUPABASE_KEY):
    print("Error: Supabase config missing. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# LiveKit Setup
LK_URL = os.getenv("LIVEKIT_URL")
LK_API_KEY = os.getenv("LIVEKIT_API_KEY")
LK_API_SECRET = os.getenv("LIVEKIT_API_SECRET")

if not (LK_URL and LK_API_KEY and LK_API_SECRET):
    print("Error: LiveKit credentials missing.")
    exit(1)

def _coerce_agent_config(value):
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


async def dispatch_call(call_record):
    lk_api = api.LiveKitAPI(url=LK_URL, api_key=LK_API_KEY, api_secret=LK_API_SECRET)
    phone_number = call_record['phone_number']
    call_id = call_record['id']
    agent_config = _coerce_agent_config(call_record.get('agent_config'))
    preset_id = call_record.get('preset_id')
    
    room_name = f"call-{phone_number.replace('+', '')}-{random.randint(1000, 9999)}"
    print(f"[{time.strftime('%X')}] Dispatching call to {phone_number} (Room: {room_name})")

    try:
        metadata = {
            "phone_number": phone_number,
            "call_id": call_id,
        }
        if preset_id:
            metadata["preset_id"] = preset_id
        if agent_config:
            metadata["agent_config"] = agent_config

        dispatch_request = api.CreateAgentDispatchRequest(
            agent_name="outbound-caller", 
            room=room_name,
            metadata=json.dumps(metadata)
        )
        
        dispatch = await lk_api.agent_dispatch.create_dispatch(dispatch_request)
        
        # Update DB with room and dispatch info
        supabase.table('calls').update({
            "status": "in_progress",
            "livekit_room_name": room_name,
            "dispatch_id": dispatch.id
        }).eq("id", call_id).execute()
        
        print(f"✅ Call Dispatched - Dispatch ID {dispatch.id}")
        
    except Exception as e:
        print(f"❌ Error dispatching: {e}")
        supabase.table('calls').update({
            "status": "failed"
        }).eq("id", call_id).execute()
        
    finally:
        await lk_api.aclose()


def process_queue():
    print("🚀 Starting Campaign Runner...")
    print("Polling Supabase for 'queued' calls...\n")
    
    while True:
        try:
            # Fetch the next queued call ordered by sequence; respect starts_at when present
            now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            response = (
                supabase.table('calls')
                .select("*")
                .eq("status", "queued")
                .or_(f"starts_at.is.null,starts_at.lte.{now_iso}")
                .order('sequence', desc=False)
                .limit(1)
                .execute()
            )
            
            if response.data and len(response.data) > 0:
                call = response.data[0]
                print(f"Found queued call for {call['phone_number']}. Preparing dispatch...")
                
                # Mark as dispatching to prevent duplicate processing
                claim = (
                    supabase.table('calls')
                    .update({"status": "dispatching"})
                    .eq("id", call['id'])
                    .eq("status", "queued")
                    .select("id")
                    .execute()
                )
                if not claim.data:
                    print("Call was already claimed by another runner, skipping.")
                    continue
                
                # Run the async dispatch
                asyncio.run(dispatch_call(call))
                
                # Delay for 30 seconds before next call
                print("⏳ Sleeping for 30 seconds before dialing next number...")
                time.sleep(30)
            else:
                # No queued calls, wait a few seconds before polling again
                time.sleep(5)
                
        except Exception as e:
            print(f"Error checking queue: {e}")
            time.sleep(10)

if __name__ == "__main__":
    process_queue()
