'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Languages, Mic, MessageSquareText, PencilLine, RotateCcw, Save, Speaker, UserRound, X } from 'lucide-react';
import {
  AGENT_PRESETS,
  AgentPresetId,
  AgentRuntimeConfig,
  getAgentPreset,
  resolveAgentRuntimeConfig,
} from '@/lib/agent-presets';
import styles from './AgentSettingsPanel.module.css';

interface AgentSettingsPanelProps {
  value: AgentRuntimeConfig;
  onChange: (next: AgentRuntimeConfig) => void;
  onSavePrompt: (presetId: AgentPresetId, prompt: string) => Promise<void>;
  promptOverrides?: Record<string, string>;
}

export function AgentSettingsPanel({ value, onChange, onSavePrompt, promptOverrides = {} }: AgentSettingsPanelProps) {
  const activePreset = getAgentPreset(value.presetId);
  const [isPromptEditing, setIsPromptEditing] = useState(false);
  const [promptDraft, setPromptDraft] = useState(value.prompt);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  const handlePresetChange = (presetId: AgentPresetId) => {
    const savedPrompt = promptOverrides[presetId];
    onChange(resolveAgentRuntimeConfig(presetId, savedPrompt ? { prompt: savedPrompt } : {}));
    setIsPromptEditing(false);
  };

  useEffect(() => {
    if (!isPromptEditing) {
      setPromptDraft(value.prompt);
    }
  }, [isPromptEditing, value.prompt, value.presetId]);

  const handleStartEditing = () => {
    setPromptError(null);
    setPromptDraft(value.prompt);
    setIsPromptEditing(true);
  };

  const handleCancelEditing = () => {
    setPromptError(null);
    setPromptDraft(value.prompt);
    setIsPromptEditing(false);
  };

  const handleSavePrompt = async () => {
    const nextPrompt = promptDraft.trim();
    if (!nextPrompt) {
      setPromptError('Prompt cannot be empty.');
      return;
    }

    setIsSavingPrompt(true);
    setPromptError(null);
    try {
      await onSavePrompt(value.presetId, nextPrompt);
      setIsPromptEditing(false);
    } catch (error) {
      setPromptError(error instanceof Error ? error.message : 'Failed to save prompt.');
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleResetToPresetDefaults = () => {
    const savedPrompt = promptOverrides[value.presetId];
    onChange(resolveAgentRuntimeConfig(value.presetId, savedPrompt ? { prompt: savedPrompt } : {}));
    setPromptError(null);
    setIsPromptEditing(false);
  };

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Runtime Configuration</p>
          <h2>Agent Stack</h2>
          <p className={styles.description}>
            Fine-tune the voice intelligence, selection logic, and core personality before dispatching.
          </p>
        </div>
        <div className={styles.badge}>
          <CheckCircle2 size={14} />
          <span>{activePreset.languageLabel}</span>
        </div>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Available presets">
        {AGENT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`${styles.tab} ${value.presetId === preset.id ? styles.tabActive : ''}`}
            onClick={() => handlePresetChange(preset.id)}
            role="tab"
            aria-selected={value.presetId === preset.id}
          >
            <span>{preset.label}</span>
            <small>{preset.languageLabel}</small>
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        <div className={styles.field}>
          <label className={styles.label}>
            <Mic size={14} />
            Transcription (STT)
          </label>
          <select
            className={styles.select}
            value={value.sttModel}
            onChange={(event) => onChange({ ...value, sttModel: event.target.value })}
          >
            {activePreset.sttOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>
            <MessageSquareText size={14} />
            Reasoning (LLM)
          </label>
          <select
            className={styles.select}
            value={value.llmModel}
            onChange={(event) => onChange({ ...value, llmModel: event.target.value })}
          >
            {activePreset.llmOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>
            <Speaker size={14} />
            Synthesis (TTS)
          </label>
          <select
            className={styles.select}
            value={value.ttsModel}
            onChange={(event) => onChange({ ...value, ttsModel: event.target.value })}
          >
            {activePreset.ttsOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>
            <Languages size={14} />
            Prompt Language
          </label>
          <input
            className={styles.input}
            value={value.language}
            onChange={(event) =>
              onChange(
                resolveAgentRuntimeConfig(value.presetId, {
                  ...value,
                  language: event.target.value,
                }),
              )
            }
            placeholder="English"
          />
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.field}>
          <label className={styles.label}>
            <MessageSquareText size={14} />
            Greeting Instruction
          </label>
          <textarea
            className={styles.compactTextarea}
            value={value.greetingInstruction}
            onChange={(event) => onChange({ ...value, greetingInstruction: event.target.value })}
            placeholder="How the assistant should greet at call start..."
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>
            <UserRound size={14} />
            Recipient Profile (Optional)
          </label>
          <textarea
            className={styles.compactTextarea}
            value={value.recipientProfile}
            onChange={(event) => onChange({ ...value, recipientProfile: event.target.value })}
            placeholder="Optional profile details to personalize the call."
          />
        </div>
      </div>

      <div className={styles.inlineActions}>
        <button type="button" className={styles.resetButton} onClick={handleResetToPresetDefaults}>
          <RotateCcw size={14} />
          Reset Agent Defaults
        </button>
      </div>

      <div className={styles.promptField}>
        <div className={styles.promptHeader}>
          <label className={styles.promptLabel}>System Instructions</label>
          <div className={styles.promptActions}>
            {!isPromptEditing ? (
              <button type="button" className={styles.ghostButton} onClick={handleStartEditing}>
                <PencilLine size={14} />
                Edit prompt
              </button>
            ) : (
              <>
                <button type="button" className={styles.ghostButton} onClick={handleCancelEditing} disabled={isSavingPrompt}>
                  <X size={14} />
                  Discard
                </button>
                <button type="button" className={styles.primaryButton} onClick={handleSavePrompt} disabled={isSavingPrompt}>
                  <Save size={14} />
                  {isSavingPrompt ? 'Saving...' : 'Apply Changes'}
                </button>
              </>
            )}
          </div>
        </div>
        <textarea
          className={isPromptEditing ? styles.promptTextarea : styles.compactTextarea}
          value={isPromptEditing ? promptDraft : value.prompt}
          onChange={(event) => setPromptDraft(event.target.value)}
          readOnly={!isPromptEditing}
          placeholder="Enter the system behavior instructions here..."
        />
        <footer className={styles.promptFooter}>
          <p className={styles.helperText}>
            Prompt, greeting, language, and recipient profile are applied per dispatch. Prompt changes can also be saved to Supabase per preset.
          </p>
          {!isPromptEditing && (
            <button
              type="button"
              className={styles.resetButton}
              onClick={() => {
                setPromptDraft(activePreset.defaultConfig.prompt);
                setIsPromptEditing(true);
              }}
            >
              <RotateCcw size={14} />
              Restore defaults
            </button>
          )}
        </footer>
        {promptError && <div className={styles.promptError}>{promptError}</div>}
      </div>

      <div className={styles.summary}>
        <div>
          <span className={styles.summaryLabel}>Arch</span>
          <strong>{activePreset.label}</strong>
        </div>
        <div>
          <span className={styles.summaryLabel}>Inf</span>
          <strong>{value.llmModel}</strong>
        </div>
        <div>
          <span className={styles.summaryLabel}>Syn</span>
          <strong>{value.ttsModel}</strong>
        </div>
        <div>
          <span className={styles.summaryLabel}>Latency</span>
          <strong>{(value.sttMode as string) === 'native' ? 'Low' : 'Std'}</strong>
        </div>
      </div>
    </section>
  );
}
