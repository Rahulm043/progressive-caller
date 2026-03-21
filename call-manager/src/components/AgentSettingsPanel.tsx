'use client';

import React from 'react';
import { CheckCircle2, Languages, Mic, MessageSquareText, Speaker } from 'lucide-react';
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
}

export function AgentSettingsPanel({ value, onChange }: AgentSettingsPanelProps) {
  const activePreset = getAgentPreset(value.presetId);

  const handlePresetChange = (presetId: AgentPresetId) => {
    onChange(resolveAgentRuntimeConfig(presetId));
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

      <label className={styles.promptField}>
        <span className={styles.promptLabel}>Prompt</span>
        <textarea
          className={styles.promptTextarea}
          value={value.prompt}
          onChange={(event) => onChange({ ...value, prompt: event.target.value })}
          rows={10}
        />
        <span className={styles.helperText}>
          Language is locked to the selected preset and is already baked into the effective prompt.
        </span>
      </label>

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
