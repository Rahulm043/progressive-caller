# # agent.py
# import os
# from livekit.agents import cli, AgentSession, JobContext
# from livekit import api
# import openaiWe are going to create a live proof voice agent using the HTTP llm TTS pipeline. I am sharing the documentation, and let's go through it step by step.

# async def entrypoint(ctx: JobContext):
#     await ctx.connect()

#     session = AgentSession(
#         stt=YourSTT(),  # Whisper or Google batch
#         llm=YourLLM(),  # OpenRouter / local LLM
#         tts=YourTTS(),  # Smallest.ai or Google
#         vad=YourVAD()
#     )
#     await session.start(room=ctx.room)

# if __name__ == "__main__":
#     cli.run_app(entrypoint, agent_name="outbound-caller")




from dotenv import load_dotenv
import os

from livekit import agents
from livekit.agents import AgentSession, Agent, RoomInputOptions
from livekit.plugins import (
    openai,
    deepgram,
    noise_cancellation,
    silero,
    sarvam,
    google,

)
from livekit.plugins.turn_detector.multilingual import MultilingualModel

load_dotenv()


from prompt import INSTRUCTIONS
from assistant_prompt import ASSISTANT_PROMPT

class Assistant(Agent):
    def __init__(self) -> None:
        # super().__init__(instructions=INSTRUCTIONS)
        super().__init__(instructions=ASSISTANT_PROMPT)




async def entrypoint(ctx: agents.JobContext):
    session = AgentSession(
        stt=sarvam.STT(
            api_key=os.getenv("SARVAM_API_KEY"),
            language="unknown",
            model="saarika:v2.5",
        ),
        llm=openai.LLM(model="gpt-4.1-mini"),
        tts=google.TTS(
            language="bn-IN",
            gender="female",
            voice_name="bn-IN-Chirp3-HD-Achernar"
        ),
        # tts=sarvam.TTS(
        #     api_key=os.getenv("SARVAM_API_KEY"),
        #     target_language_code="bn-IN",
        #     speaker="arya"
        # ),
        vad=silero.VAD.load(),
        # turn_detection=MultilingualModel(),  # bn-IN not supported
    )

    await session.start(
        room=ctx.room,
        agent=Assistant(),
        room_input_options=RoomInputOptions(
            # LiveKit Cloud enhanced noise cancellation
            # - If self-hosting, omit this parameter
            # - For telephony applications, use `BVCTelephony` for best results
            noise_cancellation=noise_cancellation.BVC(), 
        ),
    )

    await ctx.connect()

    await session.generate_reply(
        instructions="Greet the user by saying - নমস্কার, আমি সুকন্যা রিয়েলটি থেকে বলছি।"
    )
    
    # await session.generate_reply(
    # instructions="Nomoskar! Ami Aisha Sukanya Realtors theke bolchi. Apni kemon achhen?"
    # )



if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))