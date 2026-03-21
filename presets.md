# Agent Presets

These are the preset stacks used by the outbound agent and the frontend settings menu.

## Default

```python
session = AgentSession(
    stt=inference.STT(model="cartesia/ink-whisper", language="en"),
    llm=inference.LLM(model="openai/gpt-4.1-nano"),
    tts=inference.TTS(
        model="inworld/inworld-tts-1.5-mini",
        voice="Riya",
        language="hi-IN",
    ),
    turn_detection=MultilingualModel(),
    vad=ctx.proc.userdata["vad"],
    preemptive_generation=True,
)
```

## English X

```python
session = AgentSession(
    stt=inference.STT(model="cartesia/ink-whisper", language="en"),
    llm=inference.LLM(model="openai/gpt-4.1-nano"),
    tts=inference.TTS(
        model="xai/tts-1",
        voice="Ara",
        language="multi",
    ),
    turn_detection=MultilingualModel(),
    vad=ctx.proc.userdata["vad"],
    preemptive_generation=True,
)
```

## Hindi

```python
session = AgentSession(
    vad=ctx.proc.userdata["vad"],
    stt=inference.STT(model="cartesia/ink-whisper", language="hi"),
    llm=inference.LLM(model="openai/gpt-4o-mini"),
    tts=inference.TTS(
        model="inworld/inworld-tts-1.5-mini",
        voice="Riya",
        language="hi-IN",
    ),
    turn_detection=MultilingualModel(),
    preemptive_generation=True,
    min_endpointing_delay=0.28,
)
```

## Hindi X

```python
session = AgentSession(
    vad=ctx.proc.userdata["vad"],
    stt=inference.STT(model="cartesia/ink-whisper", language="hi"),
    llm=inference.LLM(model="openai/gpt-4o-mini"),
    tts=inference.TTS(
        model="xai/tts-1",
        voice="Ara",
        language="multi",
    ),
    turn_detection=MultilingualModel(),
    preemptive_generation=True,
    min_endpointing_delay=0.28,
)
```

## Bengali

```python
session = AgentSession(
    stt=sarvam.STT(
        api_key=os.getenv("SARVAM_API_KEY"),
        language="unknown",
        model="saarika:v2.5",
    ),
    llm=inference.LLM(model="openai/gpt-4o-mini"),
    tts=inference.TTS(
        model="xai/tts-1",
        voice="Ara",
        language="multi",
    ),
    vad=silero.VAD.load(),
    preemptive_generation=True,
    min_endpointing_delay=0.3,
)
```

## Notes

- `Default` is the fallback preset when no runtime config is provided.
- The prompt text should always include the selected language explicitly.
- Bengali should not use `MultilingualModel()` for turn detection. Use VAD plus endpointing instead.
