'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock, FileUp, Rocket, Sparkles, UploadCloud } from 'lucide-react';
import { AgentSettingsPanel } from '@/components/AgentSettingsPanel';
import { DashboardShell } from '@/components/DashboardShell';
import { NewCallModal } from '@/components/NewCallModal';
import {
  DEFAULT_AGENT_RUNTIME_CONFIG,
  resolveAgentRuntimeConfig,
  type AgentRuntimeConfig,
  AGENT_PRESETS
} from '@/lib/agent-presets';
import styles from './page.module.css';

const AGENT_RUNTIME_STORAGE_KEY = 'vobiz-agent-runtime-config';

export default function NewCampaignPage() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [startMode, setStartMode] = useState<'now' | 'scheduled'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [numbersText, setNumbersText] = useState('');
  const [agentConfig, setAgentConfig] = useState<AgentRuntimeConfig>(DEFAULT_AGENT_RUNTIME_CONFIG);
  const [savedPresetPrompts, setSavedPresetPrompts] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promptLoadError, setPromptLoadError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadPromptOverrides = async () => {
      try {
        const response = await fetch('/api/agent-presets');
        const data = await response.json();
        if (cancelled) return;

        const overrides = (data?.presets || []).reduce((acc: Record<string, string>, preset: { presetId: string; prompt: string }) => {
          if (preset?.presetId && preset?.prompt) {
            acc[preset.presetId] = preset.prompt;
          }
          return acc;
        }, {});

        setSavedPresetPrompts(overrides);
      } catch (loadError) {
        if (!cancelled) {
          setPromptLoadError(loadError instanceof Error ? loadError.message : 'Failed to load prompt overrides');
        }
      }
    };

    loadPromptOverrides();

    setIsMounted(true);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isMounted || typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem(AGENT_RUNTIME_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Partial<AgentRuntimeConfig> & { presetId?: string };
      const presetId = parsed.presetId || DEFAULT_AGENT_RUNTIME_CONFIG.presetId;
      const overridePrompt = savedPresetPrompts[presetId];
      setAgentConfig(resolveAgentRuntimeConfig(presetId, {
        ...parsed,
        prompt: overridePrompt || parsed.prompt,
      }));
    } catch {
      // Keep defaults if storage is unavailable or malformed.
    }
  }, [isMounted, savedPresetPrompts]);

  const parsedNumbers = numbersText
    .split(/[\n,]/)
    .map((number) => number.trim())
    .map((number) => number.replace(/[^+\d]/g, ''))
    .filter((number) => number.length >= 7);

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setNumbersText((current) => `${current}${current ? '\n' : ''}${text}`);
    } finally {
      if (event.target) event.target.value = '';
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!campaignName.trim()) {
      setError('Campaign name is required.');
      return;
    }
    if (parsedNumbers.length === 0) {
      setError('Add at least one valid phone number.');
      return;
    }
    if (startMode === 'scheduled' && !scheduledAt) {
      setError('Choose a schedule time or switch to start now.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName.trim(),
          startsAt: startMode === 'scheduled' ? new Date(scheduledAt).toISOString() : null,
          presetId: agentConfig.presetId,
          agentConfig,
          phoneNumbers: parsedNumbers,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to create campaign');
      }

      router.push(`/campaigns/${data.campaign.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create campaign');
    } finally {
      setIsSubmitting(false);
    }
  };

  const launchCall = async (phoneNumber: string, mode: 'now' | 'queue', config: AgentRuntimeConfig): Promise<boolean> => {
    const normalizedNumber = phoneNumber.trim().startsWith('+') ? phoneNumber.trim() : `+91${phoneNumber.trim()}`;
    const response = await fetch('/api/outbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: normalizedNumber, agentConfig: config, mode }),
    });

    const data = await response.json();
    if (data.success) {
      return true;
    }
    alert(`Failed to launch call: ${data.error}`);
    return false;
  };

  return (
    <DashboardShell
      onNewCall={() => setIsModalOpen(true)}
      error={error}
      onErrorClose={() => setError(null)}
    >
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Campaigns / Create</p>
          <h1>Initialize Sequence</h1>
          <p className={styles.subhead}>
            Add numbers, customize the agent once, and dispatch the automated run.
          </p>
        </div>
        <Link href="/campaigns" className={styles.backLink}>
          View Registry
        </Link>
      </header>

      <form className={styles.layout} onSubmit={handleSubmit}>
        <div className={styles.mainColumn}>
          <section id="numbers" className={styles.card}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.step}>Step 1</p>
                <h2>Target Audience</h2>
              </div>
              <div className={styles.stepBadge}>
                <UploadCloud size={14} />
                CRM / CSV
              </div>
            </div>

            <label className={styles.field}>
              <span className={styles.label}>Internal campaign identifier</span>
              <input
                className={styles.input}
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. Q2 Outbound Growth"
              />
            </label>

            <label className={styles.dropzone}>
              <input type="file" accept=".csv,.txt" onChange={handleFileImport} className={styles.hiddenInput} />
              <FileUp size={28} />
              <strong>Upload recipient list</strong>
              <span>Drop CSV/TXT. We automatically normalize formats.</span>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Direct entry</span>
              <textarea
                className={styles.textarea}
                rows={7}
                value={numbersText}
                onChange={(e) => setNumbersText(e.target.value)}
                placeholder="+91 7044311000..."
              />
            </label>

            <div className={styles.helperRow}>
              <span>{parsedNumbers.length} valid numbers identified</span>
            </div>

            {parsedNumbers.length > 0 && (
              <div className={styles.previewList}>
                {parsedNumbers.slice(0, 8).map((number) => (
                  <span key={number} className={styles.previewChip}>
                    {number}
                  </span>
                ))}
                {parsedNumbers.length > 8 && <span className={styles.previewChip}>+{parsedNumbers.length - 8} more</span>}
              </div>
            )}
          </section>

          <section id="agent" className={styles.card}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.step}>Step 2</p>
                <h2>Agent Personality</h2>
              </div>
              <div className={styles.stepBadge}>
                <Sparkles size={14} />
                Global settings applied
              </div>
            </div>

            <AgentSettingsPanel
              value={agentConfig}
              onChange={setAgentConfig}
              onSavePrompt={async (presetId, prompt) => {
                const response = await fetch('/api/agent-presets', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ presetId, prompt }),
                });
                const data = await response.json();
                if (!response.ok || !data?.success) {
                  throw new Error(data?.error || 'Failed to save prompt');
                }
                setSavedPresetPrompts((current) => ({ ...current, [presetId]: data.preset.prompt }));
                setAgentConfig((current) =>
                  resolveAgentRuntimeConfig(current.presetId, {
                    ...current,
                    prompt: data.preset.prompt,
                  }),
                );
              }}
              promptOverrides={savedPresetPrompts}
            />
            {promptLoadError && <div className={styles.warning}>{promptLoadError}</div>}
          </section>

          <section id="schedule" className={styles.card}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.step}>Step 3</p>
                <h2>Dispatch Schedule</h2>
              </div>
              <div className={styles.stepBadge}>
                <CalendarClock size={14} />
                Queue control
              </div>
            </div>

            <div className={styles.toggleRow}>
              <button
                type="button"
                className={`${styles.toggleBtn} ${startMode === 'now' ? styles.toggleActive : ''}`}
                onClick={() => setStartMode('now')}
              >
                Immediate
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${startMode === 'scheduled' ? styles.toggleActive : ''}`}
                onClick={() => setStartMode('scheduled')}
              >
                Planned
              </button>
            </div>

            {startMode === 'scheduled' && (
              <label className={styles.field}>
                <span className={styles.label}>Session start time</span>
                <input
                  className={styles.input}
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </label>
            )}
          </section>
        </div>

        <aside className={styles.summaryColumn}>
          <div className={styles.summaryCard}>
            <p className={styles.kicker}>Verification</p>
            <h2>Review Sequence</h2>
            <div className={styles.summaryStats}>
              <div>
                <span>Audience</span>
                <strong>{parsedNumbers.length}</strong>
              </div>
              <div>
                <span>Preset</span>
                <strong>{agentConfig.presetId}</strong>
              </div>
              <div>
                <span>Mode</span>
                <strong>{startMode}</strong>
              </div>
            </div>

            <div className={styles.summaryBlock}>
              <span>Campaign</span>
              <strong>{campaignName.trim() || 'Untitled Session'}</strong>
            </div>

            <div className={styles.summaryBlock}>
              <span>Core Guidance</span>
              <p>{agentConfig.prompt.slice(0, 180)}{agentConfig.prompt.length > 180 ? '...' : ''}</p>
            </div>

            <button type="submit" className={styles.createBtn} disabled={isSubmitting}>
              <Rocket size={18} />
              {isSubmitting ? 'Dispatching...' : 'Launch Campaign'}
            </button>
          </div>
        </aside>
      </form>

      <NewCallModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onLaunch={launchCall}
        queuedCount={0}
        availablePresetIds={AGENT_PRESETS.map(p => p.id)}
        defaultAgentConfig={agentConfig}
      />
    </DashboardShell>
  );
}
