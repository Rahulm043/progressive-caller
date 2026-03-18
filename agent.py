import logging
import time
import os
import json
import asyncio
from typing import Optional
from datetime import datetime
from dotenv import load_dotenv

from supabase import create_client, Client
from livekit import agents, rtc, api
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    cli,
    inference,
    room_io,
    AgentStateChangedEvent,
    MetricsCollectedEvent,
    metrics,
)
from livekit.plugins import (
    openai,
    deepgram,
    noise_cancellation,
    silero,
)
from livekit.plugins.turn_detector.multilingual import MultilingualModel

# Load environment variables
load_dotenv(".env")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("outbound-agent")

# SIP Config
OUTBOUND_TRUNK_ID = os.getenv("OUTBOUND_TRUNK_ID")
SIP_DOMAIN = os.getenv("VOBIZ_SIP_DOMAIN")

class OutboundAssistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="""You are Riya, the infectious, enthusiastic, and high-energy outbound sales representative for Progressive AI. You are a professional "Industrial Systems Architect" in spirit, but a friendly, reliable, and contagious voice in practice. Your job is to get people excited about how custom AI agents—like yourself—can transform their business.

## VOICE & OUTPUT RULES (CRITICAL)
- **PLAIN TEXT ONLY:** No markdown (**), no lists (-), no bolding, no italics, no emojis, no hashes.
- **VOICE-FIRST:** Speak in plain, human English. Use natural contractions (don't, it's, we're).
- **ONE-SENTENCE RULE:** Never speak more than one sentence at a time. Keep it crisp, punchy, and natural.
- **NATURAL FILLERS:** Use interjections like "Oh," "Totally," "Gotcha," "That's awesome" to sound like a real human in a quick chat.
- **SPELL OUT NUMBERS:** Spell out all numbers and contact details (e.g., "plus nine one" or "dot ex wise zee").

## CONVERSATIONAL STRATEGY
- **THE HOOK:** You are a living demo. You are a voice agent talking to them right now. Use that to prove what Progressive AI can do.
- **KEEP THEM TALKING:** Your goal is to make the prospect talk. Always end your one-sentence response with a short, engaging question.
- **NO MONOLOGUES:** Never give long explanations. If they ask "How does it work?", say: "We build custom engineering layers that handle your manual tasks while you sleep, does that sound like something your team could use?"
- **THE OBJECTIVE:** Get them interested in a "ten minute AI Opportunity Audit" with our lead engineer, Rahul.

## KEY KNOWLEDGE: PROGRESSIVE AI
- **What we do:** We are Industrial Systems Architects. We build custom AI agents for e-commerce and real estate.
- **E-commerce Hooks:** RTO and fake order defense, Instagram sales agents, and virtual stylists for brands like House of Ganges and Uptownie.
- **Real Estate Hooks:** Automated lead qualification and twenty-four-seven appointment setting.
- **Website:** progressive dash ay eye dot ex wise zee.

## EXAMPLE RESPONSES
- "Hi! I am Riya from Progressive AI, and I am so excited to show you how we are automating the boring stuff for brands, have you ever thought about using an AI agent for your sales?"
- "Oh, I totally hear you, managing those DMs manually is a nightmare! What if an agent like me handled all your customer questions instantly, twenty-four-seven?"
- "That is a great point! We actually built a custom system for Uptownie that slashed their return costs using AI verification, would you be open to a quick ten-minute audit to see where you could save time?"

## GUARDRAILS
- Stay enthusiastic but professional.
- If they say "No," be polite: "No worries at all, I hope you have an amazing day!"
- Never go into long technical dialogues; keep the "ping-pong" flow of the conversation alive.""",
        )

    async def on_enter(self):
        # Initial greeting is handled in entrypoint to support both inbound/outbound pickup
        pass

server = AgentServer()

def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()

server.setup_fnc = prewarm

@server.rtc_session(agent_name="outbound-caller")
async def entrypoint(ctx: JobContext):
    class PerformanceTracker:
        def __init__(self):
            self.user_stopped_speaking = 0
            self.transcript_received = 0
            self.llm_first_chunk = 0

        def reset(self):
            self.user_stopped_speaking = time.perf_counter()
            self.transcript_received = 0
            self.llm_first_chunk = 0

    performance = PerformanceTracker()
    
    # EOU: MultilingualModel provides state-of-the-art end-of-turn detection
    turn_detector_model = MultilingualModel()

    # Parse metadata for phone number (outbound dispatch)
    phone_number = None
    try:
        if ctx.job.metadata:
            data = json.loads(ctx.job.metadata)
            phone_number = data.get("phone_number")
    except Exception:
        logger.warning("No valid JSON metadata found in job.")

    # Check for existing SIP participants if no metadata (inbound)
    for identity, participant in ctx.room.remote_participants.items():
        if not phone_number:
            attr = participant.attributes or {}
            phone_number = attr.get("sip.phoneNumber") or attr.get("phoneNumber")
        if not phone_number and "sip_" in identity:
             phone_number = identity.replace("sip_", "")
    
    if phone_number:
        logger.info(f"Target participant/phone: {phone_number}")

    # Define Agent Session
    session = AgentSession(
        stt=inference.STT(model="deepgram/nova-3", language="en"),
        llm=inference.LLM(model="openai/gpt-4.1-mini"),
        tts=inference.TTS(
            model="inworld/inworld-tts-1.5-mini",
            voice="Priya",
            language="en"
        ),
        vad=ctx.proc.userdata["vad"],
        turn_detection=turn_detector_model,
        preemptive_generation=True,
        min_endpointing_delay=0.6, # Robust EOU delay
    )

    # Setup Supabase Logging
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    supabase: Client | None = None
    db_call_id: str | None = None
    db_init_done = asyncio.Event()
    call_start_time = time.time()
    
    if supabase_url and supabase_key:
        try:
            supabase = create_client(supabase_url, supabase_key)
            
            async def _init_db():
                nonlocal db_call_id
                try:
                    def _do_db_init():
                        # Check if room already exists to avoid duplicates on reconnects
                        resp = supabase.table("calls").select("id").eq("room_name", ctx.room.name).execute()
                        if not resp.data:
                            res = supabase.table("calls").insert({
                                "room_name": ctx.room.name,
                                "phone_number": phone_number,
                                "status": "in_progress",
                                "started_at": datetime.utcnow().isoformat()
                            }).execute()
                            if res.data:
                                return res.data[0]["id"]
                        else:
                            return resp.data[0]["id"]
                        return None
                        
                    db_call_id = await asyncio.to_thread(_do_db_init)
                    logger.info(f"Supabase tracking enabled: {db_call_id}")
                except Exception as e:
                    logger.error(f"Supabase DB init failed: {e}")
                finally:
                    db_init_done.set()
                    
            asyncio.create_task(_init_db())
        except Exception as e:
            logger.error(f"Supabase client creation failed: {e}")
            db_init_done.set()
    else:
        db_init_done.set()

    async def log_message(sender: str, text: str):
        if not db_init_done.is_set():
            await db_init_done.wait()
            
        if supabase and db_call_id:
            try:
                await asyncio.to_thread(
                    lambda: supabase.table("messages").insert({
                        "call_id": db_call_id,
                        "sender": sender,
                        "text": text
                    }).execute()
                )
            except Exception as e:
                logger.warning(f"Log message failed: {e}")

    async def publish_event(event_type: str, data: dict):
        payload = json.dumps({"type": event_type, **data})
        try:
            await ctx.room.local_participant.publish_data(payload.encode('utf-8'))
        except Exception as e:
            logger.warning(f"Publish event failed: {e}")

    # Event Handlers
    @session.on("user_stopped_speaking")
    def on_user_speech_stop():
        performance.reset()
        asyncio.create_task(publish_event("state", {"state": "Thinking"}))

    @session.on("user_speech_committed")
    def on_user_speech_committed(ev):
        transcript = ev.user_transcript.strip()
        performance.transcript_received = time.perf_counter()
        stt_latency = (performance.transcript_received - performance.user_stopped_speaking) * 1000
        
        logger.info(f"USER: {transcript}")
        asyncio.create_task(publish_event("user_transcript", {"text": transcript}))
        asyncio.create_task(publish_event("metrics", {"stt_delay": stt_latency}))
        asyncio.create_task(log_message("user", transcript))

    @session.on("agent_transcript")
    def on_agent_transcript(transcript: str):
        if performance.llm_first_chunk == 0:
            performance.llm_first_chunk = time.perf_counter()
            base_time = performance.transcript_received if performance.transcript_received > 0 else call_start_time
            llm_latency = (performance.llm_first_chunk - base_time) * 1000
            
            asyncio.create_task(publish_event("metrics", {"ttft": llm_latency}))
            if supabase and db_call_id:
                async def _update_latency():
                    try:
                        await asyncio.to_thread(
                            lambda: supabase.table("calls").update({"ttft_ms": int(llm_latency)}).eq("id", db_call_id).execute()
                        )
                    except Exception: pass
                asyncio.create_task(_update_latency())
        
        logger.info(f"AGENT: {transcript}")
        asyncio.create_task(publish_event("agent_transcript", {"text": transcript}))
        asyncio.create_task(log_message("agent", transcript))

    @session.on("state_changed")
    def on_state_changed(state: AgentStateChangedEvent):
        ui_state = "Idle"
        if state.state == "speaking": ui_state = "Speaking"
        elif state.state == "listening": ui_state = "Listening"
        elif state.state == "thinking": ui_state = "Thinking"
        asyncio.create_task(publish_event("state", {"state": ui_state}))

    async def shutdown_hook():
        logger.info("[SHUTDOWN] Finalizing call...")
        if not db_init_done.is_set():
            await db_init_done.wait()
            
        if supabase and db_call_id:
            try:
                duration = int(time.time() - call_start_time)
                # Build transcript summary
                transcript_text = "\n".join([f"{m.role.upper()}: {m.content}" for m in session.chat_ctx.messages if m.role in ("user", "assistant")])
                
                await asyncio.to_thread(
                    lambda: supabase.table("calls").update({
                        "status": "completed",
                        "duration_seconds": duration,
                        "ended_at": datetime.utcnow().isoformat(),
                        "metadata": {"transcript": transcript_text}
                    }).eq("id", db_call_id).execute()
                )
                logger.info(f"Call {db_call_id} completed.")
            except Exception as e:
                logger.error(f"Finalization failed: {e}")

    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(participant):
        if participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
            logger.info("Participant disconnected. Shutting down.")
            asyncio.create_task(shutdown_hook())

    # Audio Setup (BVCTelephony for SIP, BVC for Web)
    def get_room_options():
        try:
            # Using the selective noise cancellation based on participant kind
            def select_nc(params: room_io.AudioInputOptions.NoiseCancellationParams):
                 if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
                     return noise_cancellation.BVCTelephony()
                 return noise_cancellation.BVC()
            
            return agents.RoomInputOptions(noise_cancellation=select_nc)
        except Exception:
            logger.warning("Dynamic BVC selection failed, using standard BVC")
            return agents.RoomInputOptions(noise_cancellation=noise_cancellation.BVC())

    # Start Session
    await session.start(
        agent=OutboundAssistant(),
        room=ctx.room,
        room_input_options=get_room_options()
    )

    # Handle Initial Greet / Dial
    if phone_number and ctx.job.metadata: # Outbound via metadata (explicit dispatch)
        logger.info(f"Initiating outbound dial to {phone_number}...")
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
            logger.info("User picked up. Greeting...")
            await session.generate_reply(instructions="Introduce yourself briefly as Riya and ask how you can help.", allow_interruptions=True)
        except Exception as e:
            logger.error(f"Outbound dial failed: {e}")
            ctx.shutdown()
    else: # Inbound (SIP participant already joined) or manual join
        logger.info("Greeting inbound participant...")
        await session.generate_reply(instructions="Introduce yourself briefly as Riya and ask how you can help.", allow_interruptions=True)

if __name__ == "__main__":
    cli.run_app(server)
