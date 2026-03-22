'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Languages, Mic, MessageSquareText, PencilLine, RotateCcw, Save, Speaker, X } from 'lucide-react';
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

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>Agent Settings</p>
          <h2>Preset-driven voice stack</h2>
          <p className={styles.description}>
            Select a preset, inspect the effective model selections, and edit the prompt before dispatching the next call.
          </p>
        </div>
        <div className={styles.badge}>
          <CheckCircle2 size={16} />
          <span>{activePreset.languageLabel}</span>
        </div>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Agent presets">
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
        <label className={styles.field}>
          <span className={styles.label}>
            <Mic size={14} />
            STT
          </span>
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
        </label>

        <label className={styles.field}>
          <span className={styles.label}>
            <Mic size={14} />
            STT Mode
          </span>
          <input className={styles.readonlyInput} value={value.sttMode} readOnly />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>
            <MessageSquareText size={14} />
            LLM
          </span>
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
        </label>

        <label className={styles.field}>
          <span className={styles.label}>
            <Speaker size={14} />
            TTS
          </span>
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
        </label>

        <label className={styles.field}>
          <span className={styles.label}>
            <Languages size={14} />
            Locked Language
          </span>
          <input className={styles.readonlyInput} value={activePreset.languageLabel} readOnly />
        </label>
      </div>

      <div className={styles.promptField}>
        <div className={styles.promptHeader}>
          <span className={styles.promptLabel}>Prompt</span>
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
                  Cancel
                </button>
                <button type="button" className={styles.primaryButton} onClick={handleSavePrompt} disabled={isSavingPrompt}>
                  <Save size={14} />
                  {isSavingPrompt ? 'Saving...' : 'Save prompt'}
                </button>
              </>
            )}
          </div>
        </div>
        <textarea
          className={styles.promptTextarea}
          value={isPromptEditing ? promptDraft : value.prompt}
          onChange={(event) => setPromptDraft(event.target.value)}
          rows={10}
          readOnly={!isPromptEditing}
        />
        <div className={styles.promptFooter}>
          <span className={styles.helperText}>
            Language is locked to the selected preset and is already baked into the effective prompt.
          </span>
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
              Reset to default
            </button>
          )}
        </div>
        {promptError && <div className={styles.promptError}>{promptError}</div>}
      </div>

      <div className={styles.summary}>
        <div>
          <span className={styles.summaryLabel}>Effective stack</span>
          <strong>{activePreset.label}</strong>
        </div>
        <div>
          <span className={styles.summaryLabel}>Selected STT</span>
          <strong>{value.sttModel}</strong>
        </div>
        <div>
          <span className={styles.summaryLabel}>STT Mode</span>
          <strong>{value.sttMode}</strong>
        </div>
        <div>
          <span className={styles.summaryLabel}>Selected LLM</span>
          <strong>{value.llmModel}</strong>
        </div>
        <div>
          <span className={styles.summaryLabel}>Selected TTS</span>
          <strong>{value.ttsModel}</strong>
        </div>
      </div>
    </section>
  );
}
