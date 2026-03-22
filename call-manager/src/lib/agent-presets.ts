export type AgentPresetId = 'default' | 'english_x' | 'hindi' | 'hindi_x' | 'bengali' | 'multi';

export type TurnDetectionMode = 'multilingual' | 'none';
export type SarvamSttMode = 'transcribe' | 'translate' | 'verbatim' | 'translit' | 'codemix';

export interface AgentModelOption {
  label: string;
  value: string;
}

export interface AgentRuntimeConfig {
  presetId: AgentPresetId;
  sttModel: string;
  sttLanguage: string;
  sttMode: SarvamSttMode;
  llmModel: string;
  ttsModel: string;
  ttsVoice: string;
  ttsLanguage: string;
  turnDetection: TurnDetectionMode;
  minEndpointingDelay: number;
  prompt: string;
}

export interface AgentPresetDefinition {
  id: AgentPresetId;
  label: string;
  languageLabel: string;
  languagePromptLine: string;
  sttOptions: AgentModelOption[];
  llmOptions: AgentModelOption[];
  ttsOptions: AgentModelOption[];
  greetingInstruction: string;
  defaultConfig: AgentRuntimeConfig;
}

export interface AgentPresetPromptRecord {
  presetId: AgentPresetId;
  prompt: string;
  updatedAt?: string | null;
}

const PROMPT_TAIL = `Speak naturally, briefly, and without sounding scripted.
Keep responses conversational, human, and adaptable to the user.
Use one short sentence when possible, and ask one relevant question if it helps the flow.
For the opening line, do not ask if it is a bad time. Prefer asking if now is a good time,
or say you are calling briefly to introduce voice agents and AI automations for businesses.
Adapt the opener to the language and social context.
Do not use markdown, lists, or long monologues.
Do not end the call on your own.
Only stop speaking when the user has clearly finished or the call has naturally ended.`;

const createPrompt = (languageClause: string, body: string = PROMPT_TAIL) => `You are Riya from Progressive AI.
${languageClause}
${body}`;

const normalizePrompt = (preset: AgentPresetDefinition, prompt?: string) => {
  const source = (prompt || preset.defaultConfig.prompt).trim();
  const body = source.split('\n').slice(2).join('\n').trim();
  return createPrompt(preset.languagePromptLine, body || PROMPT_TAIL);
};

export const AGENT_PRESETS: AgentPresetDefinition[] = [
  {
    id: 'default',
    label: 'Default',
    languageLabel: 'English',
    languagePromptLine: 'Speak in English by default unless the user clearly speaks another language first.',
    sttOptions: [{ label: 'cartesia/ink-whisper - en', value: 'cartesia/ink-whisper' }],
    llmOptions: [{ label: 'openai/gpt-4.1-nano', value: 'openai/gpt-4.1-nano' }],
    ttsOptions: [{ label: 'inworld/inworld-tts-1.5-mini - Riya - hi-IN', value: 'inworld/inworld-tts-1.5-mini' }],
    greetingInstruction:
      'Greet the person naturally in English in one short sentence. Say you are Riya from Progressive AI, briefly mention you are calling to introduce voice agents and AI automations for businesses, and ask if now is a good time to talk. Do not sound scripted or ask if it is a bad time.',
    defaultConfig: {
      presetId: 'default',
      sttModel: 'cartesia/ink-whisper',
      sttLanguage: 'en',
      sttMode: 'transcribe',
      llmModel: 'openai/gpt-4.1-nano',
      ttsModel: 'inworld/inworld-tts-1.5-mini',
      ttsVoice: 'Riya',
      ttsLanguage: 'hi-IN',
      turnDetection: 'multilingual',
      minEndpointingDelay: 0.28,
      prompt: createPrompt('Speak in English by default unless the user clearly speaks another language first.'),
    },
  },
  {
    id: 'english_x',
    label: 'English X',
    languageLabel: 'English',
    languagePromptLine: 'Speak in English by default unless the user clearly speaks another language first.',
    sttOptions: [{ label: 'cartesia/ink-whisper - en', value: 'cartesia/ink-whisper' }],
    llmOptions: [{ label: 'openai/gpt-4.1-nano', value: 'openai/gpt-4.1-nano' }],
    ttsOptions: [{ label: 'xai/tts-1 - Ara - multi', value: 'xai/tts-1' }],
    greetingInstruction:
      'Greet the person naturally in English in one short sentence. Say you are Riya from Progressive AI, briefly mention you are calling to introduce voice agents and AI automations for businesses, and ask if now is a good time to talk. Do not sound scripted or ask if it is a bad time.',
    defaultConfig: {
      presetId: 'english_x',
      sttModel: 'cartesia/ink-whisper',
      sttLanguage: 'en',
      sttMode: 'transcribe',
      llmModel: 'openai/gpt-4.1-nano',
      ttsModel: 'xai/tts-1',
      ttsVoice: 'Ara',
      ttsLanguage: 'multi',
      turnDetection: 'multilingual',
      minEndpointingDelay: 0.28,
      prompt: createPrompt('Speak in English by default unless the user clearly speaks another language first.'),
    },
  },
  {
    id: 'hindi',
    label: 'Hindi',
    languageLabel: 'Hindi',
    languagePromptLine: 'Speak in Hindi or natural Hinglish by default unless the user clearly speaks English first.',
    sttOptions: [{ label: 'cartesia/ink-whisper - hi', value: 'cartesia/ink-whisper' }],
    llmOptions: [{ label: 'openai/gpt-4o-mini', value: 'openai/gpt-4o-mini' }],
    ttsOptions: [{ label: 'inworld/inworld-tts-1.5-mini - Riya - hi-IN', value: 'inworld/inworld-tts-1.5-mini' }],
    greetingInstruction:
      'Greet the person naturally in Hindi or natural Hinglish in one short sentence. Say you are Riya from Progressive AI, briefly mention that you are calling to introduce voice agents and AI automations for businesses, and ask if now is a good time to talk. Keep the tone warm, respectful, and natural. Do not sound scripted or ask if it is a bad time.',
    defaultConfig: {
      presetId: 'hindi',
      sttModel: 'cartesia/ink-whisper',
      sttLanguage: 'hi',
      sttMode: 'transcribe',
      llmModel: 'openai/gpt-4o-mini',
      ttsModel: 'inworld/inworld-tts-1.5-mini',
      ttsVoice: 'Riya',
      ttsLanguage: 'hi-IN',
      turnDetection: 'multilingual',
      minEndpointingDelay: 0.28,
      prompt: createPrompt('Speak in Hindi or natural Hinglish by default unless the user clearly speaks English first.'),
    },
  },
  {
    id: 'hindi_x',
    label: 'Hindi X',
    languageLabel: 'Hindi',
    languagePromptLine: 'Speak in Hindi or natural Hinglish by default unless the user clearly speaks English first.',
    sttOptions: [{ label: 'cartesia/ink-whisper - hi', value: 'cartesia/ink-whisper' }],
    llmOptions: [{ label: 'openai/gpt-4o-mini', value: 'openai/gpt-4o-mini' }],
    ttsOptions: [{ label: 'xai/tts-1 - Ara - multi', value: 'xai/tts-1' }],
    greetingInstruction:
      'Greet the person naturally in Hindi or natural Hinglish in one short sentence. Say you are Riya from Progressive AI, briefly mention that you are calling to introduce voice agents and AI automations for businesses, and ask if now is a good time to talk. Keep the tone warm, respectful, and natural. Do not sound scripted or ask if it is a bad time.',
    defaultConfig: {
      presetId: 'hindi_x',
      sttModel: 'cartesia/ink-whisper',
      sttLanguage: 'hi',
      sttMode: 'transcribe',
      llmModel: 'openai/gpt-4o-mini',
      ttsModel: 'xai/tts-1',
      ttsVoice: 'Ara',
      ttsLanguage: 'multi',
      turnDetection: 'multilingual',
      minEndpointingDelay: 0.28,
      prompt: createPrompt('Speak in Hindi or natural Hinglish by default unless the user clearly speaks English first.'),
    },
  },
  {
    id: 'bengali',
    label: 'Bengali',
    languageLabel: 'Bengali',
    languagePromptLine: 'Speak in Bengali by default unless the user clearly speaks English first.',
    sttOptions: [{ label: 'saaras:v3 - translate - auto', value: 'saaras:v3' }],
    llmOptions: [{ label: 'openai/gpt-4o-mini', value: 'openai/gpt-4o-mini' }],
    ttsOptions: [{ label: 'xai/tts-1 - Ara - multi', value: 'xai/tts-1' }],
    greetingInstruction:
      'Greet the person naturally in Bengali in one short sentence. Say you are Riya from Progressive AI, briefly mention that you are calling to introduce voice agents and AI automations for businesses, and ask if now is a good time to talk. Keep the tone warm, respectful, and natural. Do not sound scripted or ask if it is a bad time.',
    defaultConfig: {
      presetId: 'bengali',
      sttModel: 'saaras:v3',
      sttLanguage: 'unknown',
      sttMode: 'translate',
      llmModel: 'openai/gpt-4o-mini',
      ttsModel: 'xai/tts-1',
      ttsVoice: 'Ara',
      ttsLanguage: 'multi',
      turnDetection: 'none',
      minEndpointingDelay: 0.3,
      prompt: createPrompt('Speak in Bengali by default unless the user clearly speaks English first.'),
    },
  },
  {
    id: 'multi',
    label: 'Multi',
    languageLabel: 'Bengali / English / Hindi',
    languagePromptLine:
      'Speak casually. Start in Bengali by default, and adapt naturally to English or Hindi when the user does. Stay within Bengali, English, or Hindi only.',
    sttOptions: [{ label: 'saaras:v3 - codemix - auto', value: 'saaras:v3' }],
    llmOptions: [{ label: 'openai/gpt-4o-mini', value: 'openai/gpt-4o-mini' }],
    ttsOptions: [{ label: 'xai/tts-1 - Ara - multi', value: 'xai/tts-1' }],
    greetingInstruction:
      'Greet the person naturally in Bengali in one short sentence. Say you are Riya from Progressive AI, briefly mention that you are calling to introduce voice agents and AI automations for businesses, and ask if now is a good time to talk. Keep the tone warm, respectful, and natural. Do not sound scripted. If the user responds in English or Hindi, adapt naturally.',
    defaultConfig: {
      presetId: 'multi',
      sttModel: 'saaras:v3',
      sttLanguage: 'unknown',
      sttMode: 'codemix',
      llmModel: 'openai/gpt-4o-mini',
      ttsModel: 'xai/tts-1',
      ttsVoice: 'Ara',
      ttsLanguage: 'multi',
      turnDetection: 'none',
      minEndpointingDelay: 0.15,
      prompt: createPrompt(
        'Speak casually. Start in Bengali by default, and adapt naturally to English or Hindi when the user does. Stay within Bengali, English, or Hindi only.',
      ),
    },
  },
];

export const DEFAULT_AGENT_PRESET_ID: AgentPresetId = 'default';

export const AGENT_PRESET_MAP = AGENT_PRESETS.reduce((acc, preset) => {
  acc[preset.id] = preset;
  return acc;
}, {} as Record<AgentPresetId, AgentPresetDefinition>);

export const DEFAULT_AGENT_RUNTIME_CONFIG: AgentRuntimeConfig = {
  ...AGENT_PRESET_MAP[DEFAULT_AGENT_PRESET_ID].defaultConfig,
};

export function getAgentPreset(presetId: string | null | undefined): AgentPresetDefinition {
  if (presetId && presetId in AGENT_PRESET_MAP) {
    return AGENT_PRESET_MAP[presetId as AgentPresetId];
  }
  return AGENT_PRESET_MAP[DEFAULT_AGENT_PRESET_ID];
}

export function resolveAgentRuntimeConfig(
  presetId: string | null | undefined,
  overrides: Partial<AgentRuntimeConfig> = {},
): AgentRuntimeConfig {
  const preset = getAgentPreset(presetId);
  const prompt = normalizePrompt(preset, overrides.prompt);
  return {
    ...preset.defaultConfig,
    ...overrides,
    prompt,
    presetId: preset.id,
  };
}
