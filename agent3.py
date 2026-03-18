import logging
import time
import os
import json
import asyncio
from dotenv import load_dotenv
from livekit import rtc
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
    noise_cancellation,
    silero,
)
from livekit.plugins.turn_detector.multilingual import MultilingualModel

logger = logging.getLogger("agent-Jamie-2a3")

load_dotenv(".env.local")


class DefaultAgent(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="""You are a friendly, reliable voice assistant.

# Output rules

You are interacting with the user via voice. Be extremely brief, like a human in a quick conversation:

- Use very short phrases and sentences. 
- Avoid long explanations unless specifically asked.
- Respond in plain text only (no markdown, no lists).
- Help the user efficiently.

# Tools

- Use available tools as needed.
- Collect required inputs first.
- Speak outcomes clearly.""",
        )

    async def on_enter(self):
        await self.session.generate_reply(
            instructions="""Greet the user briefly and offer your assistance.""",
            allow_interruptions=True,
        )


server = AgentServer()

def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()

server.setup_fnc = prewarm

@server.rtc_session(agent_name="Jamie-2a3")
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
    
    # Instantiate MultilingualModel here where JobContext is available
    turn_detector_model = MultilingualModel()

    session = AgentSession(
        stt=inference.STT(model="deepgram/nova-3", language="en"),
        llm=inference.LLM(model="openai/gpt-4.1-nano"),
        tts=inference.TTS(
            model="inworld/inworld-tts-1.5-mini",
            voice="Priya",
            language="en"
        ),
        vad=ctx.proc.userdata["vad"],
        turn_detection=turn_detector_model,
        preemptive_generation=True,
    )

    @session.on("user_started_speaking")
    def on_user_speech_start():
        logger.info("--- User started speaking ---")

    @session.on("user_stopped_speaking")
    def on_user_speech_stop():
        performance.reset()
        logger.info("VAD: User stopped speaking")

    @session.on("user_transcript")
    def on_user_transcript(transcript: str):
        performance.transcript_received = time.perf_counter()
        stt_latency = (performance.transcript_received - performance.user_stopped_speaking) * 1000
        logger.info(f"STT: Received transcript: '{transcript}'")
        logger.info(f"LATENCY: STT (VAD end to Transcript): {stt_latency:.2f}ms")

    @session.on("agent_transcript")
    def on_agent_transcript(transcript: str):
        if performance.llm_first_chunk == 0:
            performance.llm_first_chunk = time.perf_counter()
            llm_latency = (performance.llm_first_chunk - performance.transcript_received) * 1000
            total_turnaround = (performance.llm_first_chunk - performance.user_stopped_speaking) * 1000
            logger.info(f"LLM: First chunk received: '{transcript[:15]}...'")
            logger.info(f"LATENCY: LLM (Transcript to First Chunk): {llm_latency:.2f}ms")
            logger.info(f"LATENCY: Total Turnaround (User Stop to Agent Start): {total_turnaround:.2f}ms")

    @session.on("metrics_collected")
    def on_metrics_collected(ev: MetricsCollectedEvent):
        # Prepare data for broadcast
        data = None
        if isinstance(ev.metrics, metrics.STTMetrics):
            logger.info(f"METADATA: STT Audio Duration: {ev.metrics.audio_duration:.2f}s")
            logger.info(f"METADATA: STT Processing Duration: {ev.metrics.duration:.2f}s")
            data = {"type": "stt", "audio_duration": ev.metrics.audio_duration, "duration": ev.metrics.duration}
        elif isinstance(ev.metrics, metrics.LLMMetrics):
            logger.info(f"METADATA: LLM TTFT: {ev.metrics.ttft * 1000:.2f}ms")
            logger.info(f"METADATA: LLM Duration: {ev.metrics.duration:.2f}s")
            logger.info(f"METADATA: LLM Tokens: prompt={ev.metrics.prompt_tokens}, completion={ev.metrics.completion_tokens}")
            data = {"type": "llm", "ttft": ev.metrics.ttft, "duration": ev.metrics.duration, "tokens": {"prompt": ev.metrics.prompt_tokens, "completion": ev.metrics.completion_tokens}}
        elif isinstance(ev.metrics, metrics.TTSMetrics):
            logger.info(f"METADATA: TTS TTFB: {ev.metrics.ttfb * 1000:.2f}ms")
            logger.info(f"METADATA: TTS Generation Duration: {ev.metrics.duration:.2f}s")
            logger.info(f"METADATA: TTS Audio Duration: {ev.metrics.audio_duration:.2f}s")
            data = {"type": "tts", "ttfb": ev.metrics.ttfb, "duration": ev.metrics.duration, "audio_duration": ev.metrics.audio_duration}
        elif isinstance(ev.metrics, metrics.EOUMetrics):
            logger.info(f"METADATA: EOU Delay: {ev.metrics.end_of_utterance_delay * 1000:.2f}ms")
            logger.info(f"METADATA: EOU Transcription Delay: {ev.metrics.transcription_delay * 1000:.2f}ms")
            logger.info(f"METADATA: EOU Turn Completed Delay: {ev.metrics.on_user_turn_completed_delay * 1000:.2f}ms")
            data = {"type": "eou", "delay": ev.metrics.end_of_utterance_delay, "transcription_delay": ev.metrics.transcription_delay}
        
        if data:
            asyncio.create_task(ctx.room.local_participant.publish_data(json.dumps(data)))

    @session.on("state_changed")
    def on_state_changed(state: AgentStateChangedEvent):
        logger.info(f"STATE: Agent is now {state.state}")

    await session.start(
        agent=DefaultAgent(),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: noise_cancellation.BVCTelephony() if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP else noise_cancellation.BVC(),
            ),
        ),
    )


if __name__ == "__main__":
    cli.run_app(server)
