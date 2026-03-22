'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Clock,
  ChevronRight,
  LayoutDashboard,
  Plus,
  PhoneCall,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { NewCallModal } from '@/components/NewCallModal';
import { AgentSettingsPanel } from '@/components/AgentSettingsPanel';
import { VoiceAgentDialog } from '@/components/VoiceAgentDialog';
import { AgentChatTranscript } from '@/components/agent-chat-transcript';
import {
  AgentRuntimeConfig,
  DEFAULT_AGENT_RUNTIME_CONFIG,
  resolveAgentRuntimeConfig,
} from '@/lib/agent-presets';
import styles from './page.module.css';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
const AGENT_RUNTIME_STORAGE_KEY = 'vobiz-agent-runtime-config';

interface PresetPromptRecord {
  presetId: string;
  prompt: string;
  updatedAt?: string | null;
}

interface Call {
  id: string;
  phone_number: string;
  status: string;
  created_at: string;
  sequence?: number | null;
  starts_at?: string | null;
  duration_seconds: number | null;
  transcript: TranscriptPayload | null;
  livekit_room_name?: string | null;
  dispatch_id?: string | null;
}

interface CampaignSummary {
  id: string;
  name: string;
  preset_id: string;
  status: string;
  starts_at: string | null;
  created_at: string;
  stats: {
    queued: number;
    active: number;
    completed: number;
    failed: number;
    total: number;
  };
  agent_prompt?: string;
}

interface TranscriptMessage {
  type?: 'message';
  role?: string;
  content?: string;
  created_at?: string;
}

interface TranscriptMetric {
  type?: 'metric' | 'event';
  event_name?: string;
  stage?: string | null;
  latency_ms?: number | null;
  created_at?: string;
  metrics?: Record<string, unknown>;
  payload?: Record<string, unknown> | unknown[];
}

interface TranscriptPayload {
  messages?: TranscriptMessage[];
  chat_history?: TranscriptMessage[];
  telemetry_messages?: TranscriptMessage[];
  metrics?: TranscriptMetric[];
  events?: TranscriptMetric[];
  important_events?: TranscriptMetric[];
  summary?: string | null;
  status?: string | null;
  updated_at?: string;
}

export default function Dashboard() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTestAgentOpen, setIsTestAgentOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [calls, setCalls] = useState<Call[]>([]);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [agentConfig, setAgentConfig] = useState<AgentRuntimeConfig>(DEFAULT_AGENT_RUNTIME_CONFIG);
  const [savedPresetPrompts, setSavedPresetPrompts] = useState<Record<string, string>>({});
  const [promptLoadError, setPromptLoadError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);

  const syncSelectedCall = useCallback((nextCalls: Call[]) => {
    setSelectedCall((current) => {
      if (!current) return current;
      const updated = nextCalls.find((call) => call.id === current.id);
      return updated ?? current;
    });
  }, []);

  const fetchCalls = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const { data, error: sbError } = await supabase
        .from('calls')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (sbError) {
        console.error('Supabase Error:', sbError);
        setError(`Supabase Error: ${sbError.message} (Code: ${sbError.code})`);
      } else {
        const nextCalls = data || [];
        setCalls(nextCalls);
        syncSelectedCall(nextCalls);
      }
    } catch (fetchError: unknown) {
      console.error('Fetch exception:', fetchError);
      setError(`Connection Exception: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [syncSelectedCall]);

  const fetchCampaigns = useCallback(async () => {
    setCampaignsLoading(true);
    setCampaignsError(null);
    try {
      const res = await fetch('/api/campaigns/summary');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load campaigns');
      setCampaigns(data.campaigns || []);
    } catch (err) {
      setCampaignsError(err instanceof Error ? err.message : 'Failed to load campaigns');
    } finally {
      setCampaignsLoading(false);
    }
  }, []);

  const clearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear ALL call logs from the database?')) return;

    setIsLoading(true);
    try {
      const { error: clearError } = await supabase
        .from('calls')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (clearError) throw clearError;
      setCalls([]);
      setSelectedCall(null);
    } catch (clearError: unknown) {
      console.error('Error clearing logs:', clearError);
      setError(clearError instanceof Error ? clearError.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchCalls();
    fetchCampaigns();

    const channel = supabase
      .channel('calls-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, (payload) => {
        const nextCall = payload.new as Call;
        if (payload.eventType === 'INSERT') {
          setCalls((prev) => [nextCall, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setCalls((prev) => prev.map((call) => (call.id === nextCall.id ? nextCall : call)));
        }
        setSelectedCall((prev) => (prev && prev.id === nextCall.id ? nextCall : prev));
      })
      .subscribe();

    const refreshTimer = window.setInterval(() => {
      fetchCalls({ silent: true });
    }, 4000);

    return () => {
      window.clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchCalls, fetchCampaigns]);

  useEffect(() => {
    if (!isMounted) return;

    let cancelled = false;

    const loadPresetPrompts = async () => {
      try {
        const response = await fetch('/api/agent-presets');
        const data = await response.json();
        if (cancelled) return;

        const nextOverrides = (data?.presets || []).reduce((acc: Record<string, string>, preset: PresetPromptRecord) => {
          if (preset?.presetId && preset?.prompt) {
            acc[preset.presetId] = preset.prompt;
          }
          return acc;
        }, {});

        setSavedPresetPrompts(nextOverrides);
        setPromptLoadError(null);

        setAgentConfig((current) => {
          const overridePrompt = nextOverrides[current.presetId];
          if (!overridePrompt || current.prompt === overridePrompt) {
            return current;
          }

          return resolveAgentRuntimeConfig(current.presetId, {
            ...current,
            prompt: overridePrompt,
          });
        });
      } catch (loadError) {
        if (!cancelled) {
          console.warn('Failed to load preset prompts:', loadError);
          setPromptLoadError(loadError instanceof Error ? loadError.message : 'Failed to load saved preset prompts.');
        }
      }
    };

    loadPresetPrompts();

    return () => {
      cancelled = true;
    };
  }, [isMounted]);

  useEffect(() => {
    if (!isMounted || typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem(AGENT_RUNTIME_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Partial<AgentRuntimeConfig> & { presetId?: string };
      const presetId = parsed.presetId || DEFAULT_AGENT_RUNTIME_CONFIG.presetId;
      const savedPrompt = savedPresetPrompts[presetId];
      setAgentConfig(resolveAgentRuntimeConfig(presetId, {
        ...parsed,
        prompt: savedPrompt || parsed.prompt,
      }));
    } catch (storageError) {
      console.warn('Failed to load agent settings from localStorage:', storageError);
    }
  }, [isMounted, savedPresetPrompts]);

  useEffect(() => {
    if (!isMounted || typeof window === 'undefined') return;
    window.localStorage.setItem(AGENT_RUNTIME_STORAGE_KEY, JSON.stringify(agentConfig));
  }, [agentConfig, isMounted]);

  useEffect(() => {
    if (!isMounted) return;

    const overridePrompt = savedPresetPrompts[agentConfig.presetId];
    if (!overridePrompt || agentConfig.prompt === overridePrompt) {
      return;
    }

    setAgentConfig((current) => {
      const currentOverride = savedPresetPrompts[current.presetId];
      if (!currentOverride || current.prompt === currentOverride) {
        return current;
      }

      return resolveAgentRuntimeConfig(current.presetId, {
        ...current,
        prompt: currentOverride,
      });
    });
  }, [agentConfig.presetId, agentConfig.prompt, isMounted, savedPresetPrompts]);

  const activeJobs = calls.filter((call) => call.status === 'queued' || call.status === 'dispatching' || call.status === 'in_progress');
  const queuedCalls = calls.filter((call) => call.status === 'queued').sort((a, b) => {
    if (a.sequence === null || a.sequence === undefined) return 1;
    if (b.sequence === null || b.sequence === undefined) return -1;
    return a.sequence - b.sequence;
  });
  const headSequence = queuedCalls[0]?.sequence;
  const finishedCalls = calls.filter((call) => call.status === 'completed' || call.status === 'failed');

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const text = await file.text();
      const numbers = text.split(/[\n,]/).map((number) => number.trim()).filter((number) => number.length > 5);

      if (numbers.length === 0) {
        alert('No valid numbers found in CSV');
        return;
      }

      const response = await fetch('/api/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `CSV ${new Date().toLocaleString()}`,
          startsAt: null,
          phoneNumbers: numbers,
          agentConfig,
          presetId: agentConfig.presetId,
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert(`Successfully queued ${data.queuedCount} calls!`);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (uploadError) {
      console.error(uploadError);
      alert('Failed to parse and upload CSV');
    } finally {
      setIsUploading(false);
      if (event.target) event.target.value = '';
    }
  };

  const launchCall = async (phoneNumber: string, mode: 'now' | 'queue') => {
    try {
      const response = await fetch('/api/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: `+91${phoneNumber}`,
          agentConfig,
          mode,
        }),
      });

      const data = await response.json();

      if (data.success) {
        await fetchCalls({ silent: true });
      } else {
        alert(`Failed to launch call: ${data.error}\n\n${data.details || ''}`);
      }
    } catch (launchError) {
      console.error('Launch error:', launchError);
      alert('Network error launching call');
    }
  };

  const handleSavePrompt = async (presetId: string, prompt: string) => {
    const response = await fetch('/api/agent-presets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetId, prompt }),
    });

    const data = await response.json();
    if (!response.ok || !data?.success) {
      throw new Error(data?.error || 'Failed to save prompt');
    }

    setSavedPresetPrompts((current) => ({
      ...current,
      [presetId]: data.preset.prompt,
    }));

    setAgentConfig((current) =>
      resolveAgentRuntimeConfig(current.presetId, {
        ...current,
        prompt: data.preset.prompt,
      }),
    );
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTranscriptMessages = (transcript: TranscriptPayload | TranscriptMessage[] | null | undefined) => {
    if (!transcript) return [];
    const messages = Array.isArray(transcript)
      ? transcript
      : transcript.messages || transcript.chat_history || transcript.telemetry_messages || [];

    return messages.map((message, index) => ({
      id: index.toString(),
      timestamp: message.created_at ? new Date(message.created_at).getTime() : Date.now(),
      from: { isLocal: message.role === 'user' } as { isLocal: boolean },
      message: message.content || '',
    }));
  };

  const getTranscriptSummary = (transcript: TranscriptPayload | TranscriptMessage[] | null | undefined) => {
    if (!transcript || Array.isArray(transcript)) return null;
    return transcript.summary || null;
  };

  const getTranscriptMetrics = (transcript: TranscriptPayload | TranscriptMessage[] | null | undefined) => {
    if (!transcript || Array.isArray(transcript)) return [];
    const metrics = transcript.important_events || transcript.events || transcript.metrics || [];
    const filtered = metrics.filter((item) => {
      const name = (item.event_name || item.type || '').toLowerCase();
      return name.includes('call') || name.includes('summary') || name.includes('dial') || name.includes('tool') || name.includes('failed') || name.includes('answer');
    });
    const source = filtered.length > 0 ? filtered : metrics;
    return source.map((item, index) => ({
      id: `${item.event_name || item.type || 'metric'}-${index}`,
      label: item.event_name || item.type || 'metric',
      stage: item.stage || '--',
      latency: item.latency_ms,
      createdAt: item.created_at,
      payload: item.payload || item.metrics,
    }));
  };

  const selectedTranscriptSummary = selectedCall ? getTranscriptSummary(selectedCall.transcript) : null;
  const selectedTranscriptMessages = selectedCall ? getTranscriptMessages(selectedCall.transcript) : [];
  const selectedTranscriptMetrics = selectedCall ? getTranscriptMetrics(selectedCall.transcript) : [];

  if (!isMounted) {
    return (
      <div className={styles.bootScreen}>
        <div className={styles.bootCard}>
          <span className={styles.bootPulse} />
          <p className={styles.bootKicker}>Vobiz AI</p>
          <h2>Loading command center</h2>
          <p>Preparing the dashboard shell and syncing the latest call state.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      {error && (
        <div className={styles.toast} role="alert" aria-live="polite">
          <div>
            <span className={styles.toastKicker}>Connection issue</span>
            <strong>{error}</strong>
          </div>
          <button type="button" onClick={() => setError(null)} className={styles.toastClose}>
            <X size={16} />
          </button>
        </div>
      )}

      <aside className={styles.sidebar}>
        <div className={styles.brandBlock}>
          <div className={styles.brandMark}>V</div>
          <div>
            <p className={styles.brandKicker}>Outbound cockpit</p>
            <span className={styles.brandName}>Vobiz AI</span>
          </div>
        </div>

        <div className={styles.sidebarPanel}>
          <div className={styles.sidebarPanelHeader}>
            <span>Live sync</span>
            <span className={styles.liveBadge}>
              <span className={styles.liveDot} />
              {isLoading ? 'Refreshing' : 'Online'}
            </span>
          </div>
          <div className={styles.sidebarMetricGrid}>
            <div className={styles.sidebarMetric}>
              <span>Queue</span>
              <strong>{activeJobs.length}</strong>
            </div>
            <div className={styles.sidebarMetric}>
              <span>Closed</span>
              <strong>{finishedCalls.length}</strong>
            </div>
            <div className={styles.sidebarMetric}>
              <span>Saved prompts</span>
              <strong>{Object.keys(savedPresetPrompts).length}</strong>
            </div>
          </div>
          <p className={styles.sidebarNote}>
            The dashboard keeps the selected preset and prompt locally so dispatches stay consistent across refreshes.
          </p>
        </div>

        <nav className={styles.nav} aria-label="Dashboard sections">
          <a href="#overview" className={`${styles.navItem} ${styles.active}`}>
            <LayoutDashboard size={18} /> Overview
          </a>
          <a href="#live-jobs" className={styles.navItem}>
            <Activity size={18} /> Active jobs
          </a>
          <a href="#call-logs" className={styles.navItem}>
            <Clock size={18} /> Call logs
          </a>
          <a href="#agent-settings" className={styles.navItem}>
            <Sparkles size={18} /> Agent settings
          </a>
        </nav>

        <div className={styles.sidebarFooter}>
          <span className={styles.sidebarFooterLabel}>Runtime</span>
          <strong>{agentConfig.presetId}</strong>
          <p>
            {promptLoadError ? `Prompt sync warning: ${promptLoadError}` : 'Preset and prompt overrides are ready for the next launch.'}
          </p>
        </div>
      </aside>

      <main className={styles.main}>
        <section id="overview" className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Command center</p>
            <h1>Call Manager</h1>
            <p className={styles.heroText}>
              Real-time observation, campaign launches, and agent tuning in one operations view.
            </p>
            <div className={styles.heroChips}>
              <span className={styles.heroChip}>Supabase live feed</span>
              <span className={styles.heroChip}>Preset-aware dispatch</span>
              <span className={styles.heroChip}>Web test ready</span>
            </div>
          </div>

          <div className={styles.heroActions}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => document.getElementById('csvUpload')?.click()}
              disabled={isUploading}
            >
              <Upload size={18} />
              {isUploading ? 'Uploading...' : 'Upload CSV'}
            </button>
            <button type="button" className={styles.primaryBtn} onClick={() => setIsModalOpen(true)}>
              <Plus size={18} />
              Launch New Call
            </button>
            <button type="button" className={styles.ghostBtn} onClick={() => setIsTestAgentOpen(true)}>
              <PhoneCall size={18} />
              Talk to Agent
            </button>
            <input
              type="file"
              id="csvUpload"
              accept=".csv,.txt"
              className={styles.hiddenInput}
              onChange={handleFileUpload}
            />
          </div>
        </section>

        <section className={styles.agentTldr}>
          <div>
            <p className={styles.sectionKicker}>Current agent</p>
            <h2>{agentConfig.presetId}</h2>
            <p className={styles.sectionMeta}>LLM {agentConfig.llmModel} · TTS {agentConfig.ttsModel} ({agentConfig.ttsVoice}) · STT {agentConfig.sttModel}</p>
            <p className={styles.promptSnippet}>{(agentConfig.prompt || '').slice(0, 160)}{agentConfig.prompt.length > 160 ? '…' : ''}</p>
          </div>
          <div className={styles.agentTldrActions}>
            <button type="button" className={styles.primaryBtn} onClick={() => setIsModalOpen(true)}>
              <Plus size={18} />
              Launch single call
            </button>
            <button type="button" className={styles.ghostBtn} onClick={() => setIsTestAgentOpen(true)}>
              <PhoneCall size={18} />
              Test agent
            </button>
          </div>
        </section>

        <section id="agent-settings" className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionKicker}>Voice stack</p>
              <h2>Preset-driven agent settings</h2>
            </div>
            <p className={styles.sectionMeta}>
              Keep the worker, prompt, and dispatch metadata in sync before launching a campaign.
            </p>
          </div>
          <div className={styles.panelCard}>
            <AgentSettingsPanel
              value={agentConfig}
              onChange={setAgentConfig}
              onSavePrompt={handleSavePrompt}
              promptOverrides={savedPresetPrompts}
            />
            {promptLoadError && <div className={styles.inlineWarning}>Prompt sync warning: {promptLoadError}</div>}
          </div>
        </section>

        <section className={styles.metricGrid}>
          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>Total opportunities</span>
            <strong className={styles.metricValue}>{calls.length}</strong>
            <span className={styles.metricMeta}>All call records synced from Supabase</span>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>Successful connections</span>
            <strong className={styles.metricValue}>{finishedCalls.filter((call) => call.status === 'completed').length}</strong>
            <span className={styles.metricMeta}>Completed outcomes in the call history</span>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>Active queued</span>
            <strong className={styles.metricValue}>{activeJobs.length}</strong>
            <span className={styles.metricMeta}>Queued, dispatching, or in-progress jobs</span>
          </article>
        </section>

        <section className={styles.workspaceGrid}>
          <article className={styles.panelCard}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionKicker}>Runner health</p>
                <h2>Live ops status</h2>
              </div>
              <span className={styles.sectionMeta}>Head seq {headSequence ?? '—'} | Queue {queuedCalls.length}</span>
            </div>
            <div className={styles.healthGrid}>
              <div className={styles.cardStat}>
                <span className={styles.sectionKicker}>Queue</span>
                <strong>{queuedCalls.length}</strong>
              </div>
              <div className={styles.cardStat}>
                <span className={styles.sectionKicker}>Active</span>
                <strong>{activeJobs.length}</strong>
              </div>
              <div className={styles.cardStat}>
                <span className={styles.sectionKicker}>Completed</span>
                <strong>{finishedCalls.filter((call) => call.status === 'completed').length}</strong>
              </div>
            </div>
          </article>
          <article className={styles.panelCard} style={{ gridColumn: '1 / -1' }}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionKicker}>Campaigns</p>
                <h2>Running & scheduled</h2>
              </div>
              <div className={styles.toolbar}>
                <Link href="/campaigns" className={styles.toolbarBtn}>Open campaigns</Link>
                <button type="button" className={styles.toolbarBtn} onClick={fetchCampaigns} disabled={campaignsLoading}>
                  {campaignsLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </div>

            {campaignsError && <div className={styles.inlineWarning}>{campaignsError}</div>}

            {campaignsLoading && campaigns.length === 0 ? (
              <div className={styles.tableState}>Loading campaigns…</div>
            ) : campaigns.length === 0 ? (
              <div className={styles.tableState}>
                <p>No campaigns yet.</p>
                <span>Create one via CSV upload or the campaigns page.</span>
              </div>
            ) : (
              <div className={styles.campaignPreviewGrid}>
                {campaigns.map((c) => (
                  <Link key={c.id} href={`/campaigns/${c.id}`} className={styles.campaignCard}>
                    <div className={styles.campaignTop}>
                      <div>
                        <p className={styles.sectionKicker}>{c.status}</p>
                        <h3>{c.name}</h3>
                        <p className={styles.sectionMeta}>
                          {c.starts_at ? `Starts ${new Date(c.starts_at).toLocaleString()}` : 'Starts immediately'}
                        </p>
                        <p className={styles.sectionMeta}>Preset {c.preset_id}</p>
                        {c.agent_prompt && (
                          <p className={styles.promptSnippet}>
                            {(c.agent_prompt || '').slice(0, 120)}{(c.agent_prompt || '').length > 120 ? '…' : ''}
                          </p>
                        )}
                      </div>
                      <div className={styles.sequenceBadge}>Preset {c.preset_id}</div>
                    </div>
                    <div className={styles.campaignStats}>
                      <div>
                        <span className={styles.sectionKicker}>Queued</span>
                        <strong>{c.stats.queued}</strong>
                      </div>
                      <div>
                        <span className={styles.sectionKicker}>Active</span>
                        <strong>{c.stats.active}</strong>
                      </div>
                      <div>
                        <span className={styles.sectionKicker}>Completed</span>
                        <strong>{c.stats.completed}</strong>
                      </div>
                      <div>
                        <span className={styles.sectionKicker}>Total</span>
                        <strong>{c.stats.total}</strong>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </article>
          <article id="live-jobs" className={styles.panelCard}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionKicker}>Live monitor</p>
                <h2>Active agent jobs</h2>
              </div>
              <span className={styles.sectionMeta}>{activeJobs.length} live</span>
            </div>

            {queuedCalls.length > 0 && (
              <div className={styles.nextUpBar}>
                <div>
                  <p className={styles.sectionKicker}>Next up</p>
                  <strong>{queuedCalls[0].phone_number}</strong>
                  {queuedCalls[0].starts_at && (
                    <span className={styles.sectionMeta}>
                      starts at {new Date(queuedCalls[0].starts_at).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                <div className={styles.sequenceBadge}>
                  Seq {queuedCalls[0].sequence ?? '—'}
                </div>
              </div>
            )}

            <div className={styles.liveGrid}>
              {activeJobs.length === 0 ? (
                <div className={styles.emptyState}>
                  <PhoneCall size={36} />
                  <p>No active agent jobs yet.</p>
                  <span>If you just launched a call, give it a few seconds to appear in the stream.</span>
                </div>
              ) : (
                activeJobs.map((call) => {
                  const badgeClass =
                    call.status === 'in_progress'
                      ? styles.connected
                      : call.status === 'dispatching'
                        ? styles.transcribing
                        : styles.ringing;

                  return (
                    <div key={call.id} className={styles.callCard}>
                      <div className={styles.callCardHeader}>
                        <span className={styles.phoneNumber}>{call.phone_number}</span>
                        <span className={`${styles.statusBadge} ${badgeClass}`}>{call.status.toUpperCase()}</span>
                      </div>
                      <div className={styles.callDetails}>
                        <div>
                          <span>Started</span>
                          <strong>{new Date(call.created_at).toLocaleTimeString()}</strong>
                        </div>
                        <div>
                          <span>ID</span>
                          <strong>{call.id.slice(0, 8)}...</strong>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </article>

          <article id="call-logs" className={styles.panelCard}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionKicker}>History</p>
                <h2>Recent call logs</h2>
              </div>
              <div className={styles.toolbar}>
                <button type="button" className={styles.toolbarBtn} onClick={() => console.log('Raw Supabase Data:', calls)}>
                  Log to console
                </button>
                <button type="button" className={styles.toolbarDangerBtn} onClick={clearLogs} disabled={isLoading}>
                  Clear logs
                </button>
                <button type="button" className={styles.toolbarBtn} onClick={() => fetchCalls()} disabled={isLoading}>
                  <RefreshCw size={14} />
                  {isLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </div>

            <div className={styles.tableCard}>
              {isLoading && calls.length === 0 ? (
                <div className={styles.tableState}>
                  <div className={styles.loadingPill}>Loading data...</div>
                  <p>Connecting to Supabase and pulling the latest records.</p>
                </div>
              ) : calls.length === 0 ? (
                <div className={styles.tableState}>
                  <p>No records found in the calls table.</p>
                  <span>Launch a call to create the first record.</span>
                </div>
              ) : finishedCalls.length === 0 ? (
                <div className={styles.tableState}>
                  <p>{calls.length} entries found, but none are completed yet.</p>
                  <span>Check the active jobs section for in-flight calls.</span>
                </div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Recipient</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>Time</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {finishedCalls.map((call) => {
                      const badgeClass = call.status === 'completed' ? styles.completed : styles.failed;

                      return (
                        <tr key={call.id} onClick={() => setSelectedCall(call)} className={styles.tableRow}>
                          <td className={styles.tdPhone}>{call.phone_number}</td>
                          <td>
                            <span className={`${styles.statusBadge} ${badgeClass}`}>{call.status.toUpperCase()}</span>
                          </td>
                          <td className={styles.tdDuration}>{formatDuration(call.duration_seconds)}</td>
                          <td className={styles.tdTime}>
                            {new Date(call.created_at).toLocaleDateString()} {new Date(call.created_at).toLocaleTimeString()}
                          </td>
                          <td className={styles.tdAction}>
                            <ChevronRight size={16} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </article>
        </section>

        {selectedCall && (
          <div className={styles.drawerOverlay} onClick={() => setSelectedCall(null)}>
            <div className={styles.drawer} onClick={(event) => event.stopPropagation()}>
              <div className={styles.drawerHeader}>
                <div>
                  <p className={styles.drawerKicker}>Call log</p>
                  <h2>Full record and transcript</h2>
                  <p className={styles.drawerDescription}>
                    Review the call summary, transcript, and important events from the selected record.
                  </p>
                </div>
                <button type="button" onClick={() => setSelectedCall(null)} className={styles.drawerClose}>
                  <X size={20} />
                </button>
              </div>

              <div className={styles.transcriptContainer}>
                <div className={styles.drawerMetaGrid}>
                  <div className={styles.drawerMetaCard}>
                    <span className={styles.drawerMetaLabel}>Recipient</span>
                    <strong>{selectedCall.phone_number}</strong>
                  </div>
                  <div className={styles.drawerMetaCard}>
                    <span className={styles.drawerMetaLabel}>Status</span>
                    <strong>{selectedCall.status.toUpperCase()}</strong>
                  </div>
                  <div className={styles.drawerMetaCard}>
                    <span className={styles.drawerMetaLabel}>Duration</span>
                    <strong>{formatDuration(selectedCall.duration_seconds)}</strong>
                  </div>
                  <div className={styles.drawerMetaCard}>
                    <span className={styles.drawerMetaLabel}>Started</span>
                    <strong>{new Date(selectedCall.created_at).toLocaleString()}</strong>
                  </div>
                </div>

                {selectedTranscriptSummary && (
                  <section className={styles.drawerCard}>
                    <div className={styles.drawerCardHeader}>
                      <div>
                        <span className={styles.drawerCardKicker}>Summary</span>
                        <h3>Auto-generated call summary</h3>
                      </div>
                      <span className={styles.drawerCardCount}>From transcript</span>
                    </div>
                    <p className={styles.drawerSummaryText}>{selectedTranscriptSummary}</p>
                  </section>
                )}

                {selectedTranscriptMessages.length > 0 ? (
                  <AgentChatTranscript messages={selectedTranscriptMessages} style={{ height: '100%' }} />
                ) : (
                  <div className={styles.drawerEmpty}>No transcript available for this call.</div>
                )}

                {selectedTranscriptMetrics.length > 0 && (
                  <div className={styles.metricsSection}>
                    <div className={styles.metricsSectionHeader}>Important call events</div>
                    <div className={styles.metricsList}>
                      {selectedTranscriptMetrics.map((metric) => (
                        <div key={metric.id} className={styles.metricItem}>
                          <div className={styles.metricItemTop}>
                            <span>{metric.label}</span>
                            <span>{metric.latency !== null && metric.latency !== undefined ? `${metric.latency.toFixed(2)} ms` : '--'}</span>
                          </div>
                          <div className={styles.metricItemBottom}>
                            Stage: {metric.stage} {metric.createdAt ? `• ${new Date(metric.createdAt).toLocaleTimeString()}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <NewCallModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onLaunch={launchCall}
        queuedCount={queuedCalls.length}
      />

      <VoiceAgentDialog
        isOpen={isTestAgentOpen}
        onClose={() => setIsTestAgentOpen(false)}
        agentConfig={agentConfig}
      />
    </div>
  );
}
