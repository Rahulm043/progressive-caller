'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  HelpCircle,
  LogOut,
  Plus,
  PhoneCall,
  RefreshCw,
  Settings,
  X,
  LayoutDashboard,
  Layers,
  FilePlus,
  ChevronDown,
  MonitorPlay,
  Play,
  ArrowUpRight,
  History as HistoryIcon,
  Search
} from 'lucide-react';
import Link from 'next/link';
import { NewCallModal } from '@/components/NewCallModal';
import { AgentSettingsPanel } from '@/components/AgentSettingsPanel';
import { VoiceAgentDialog } from '@/components/VoiceAgentDialog';
import { AgentChatTranscript } from '@/components/agent-chat-transcript';
import { DashboardShell } from '@/components/DashboardShell';
import {
  AgentRuntimeConfig,
  DEFAULT_AGENT_RUNTIME_CONFIG,
  resolveAgentRuntimeConfig,
  AGENT_PRESETS
} from '@/lib/agent-presets';
import styles from './page.module.css';

const AGENT_RUNTIME_STORAGE_KEY = 'vobiz-agent-runtime-config';

interface Call {
  id: string;
  phone_number: string;
  status: string;
  effective_status?: string;
  is_active?: boolean;
  is_stale_active?: boolean;
  created_at: string;
  sequence?: number | null;
  starts_at?: string | null;
  duration_seconds: number | null;
  effective_duration_seconds?: number | null;
  transcript: TranscriptPayload | null;
}

interface CampaignSummary {
  id: string;
  name: string;
  preset_id: string;
  status: string;
  starts_at: string | null;
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
  role?: string;
  content?: string;
  created_at?: string;
}

interface TranscriptPayload {
  messages?: TranscriptMessage[];
  chat_history?: TranscriptMessage[];
  telemetry_messages?: TranscriptMessage[];
  summary?: string | null;
}

type TranscriptFilter = 'all' | 'caller' | 'agent';
type ActivityTab = 'campaigns' | 'logs';

export default function Dashboard() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTestAgentOpen, setIsTestAgentOpen] = useState(false);
  const [isAgentEditorOpen, setIsAgentEditorOpen] = useState(false);
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
  const [transcriptFilter, setTranscriptFilter] = useState<TranscriptFilter>('all');
  const [activityTab, setActivityTab] = useState<ActivityTab>('logs');
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);

  const fetchCalls = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/calls?limit=100');
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error || 'Failed to fetch call updates');
        return;
      }
      setCalls(data.calls || []);
    } catch (fetchError) {
      setError(`Connection Exception: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

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

  useEffect(() => {
    setIsMounted(true);
    fetchCalls();
    fetchCampaigns();

    const refreshTimer = window.setInterval(() => {
      fetchCalls(true);
    }, 4000);
    const campaignRefreshTimer = window.setInterval(() => {
      fetchCampaigns();
    }, 6000);

    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(campaignRefreshTimer);
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

        const nextOverrides = (data?.presets || []).reduce((acc: Record<string, string>, preset: { presetId: string; prompt: string }) => {
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
      setAgentConfig(resolveAgentRuntimeConfig(presetId, { ...parsed, prompt: savedPrompt || parsed.prompt }));
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
    if (!overridePrompt || agentConfig.prompt === overridePrompt) return;

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

  const activeJobs = calls.filter((call) => call.is_active === true);
  const queuedCalls = calls.filter((call) => call.status === 'queued').sort((a, b) => {
    if (a.sequence === null || a.sequence === undefined) return 1;
    if (b.sequence === null || b.sequence === undefined) return -1;
    return a.sequence - b.sequence;
  });
  const finishedCalls = calls.filter((call) => call.status === 'completed' || call.status === 'failed');
  const primaryCampaign = campaigns.find((campaign) => campaign.stats.active > 0)
    || campaigns.find((campaign) => campaign.stats.queued > 0)
    || campaigns[0]
    || null;
  const currentCall = activeJobs[0] || null;
  const campaignTotal = primaryCampaign?.stats.total ?? 0;
  const campaignCompleted = primaryCampaign?.stats.completed ?? 0;
  const campaignFailed = primaryCampaign?.stats.failed ?? 0;
  const campaignActive = primaryCampaign?.stats.active ?? activeJobs.length;
  const campaignCalled = Math.min(campaignTotal, campaignCompleted + campaignFailed + campaignActive);
  const campaignLeft = Math.max(0, campaignTotal - campaignCalled);
  const campaignSuccessRate = campaignCalled > 0 ? Math.round((campaignCompleted / campaignCalled) * 100) : 0;
  const averageDurationSeconds = finishedCalls.length > 0
    ? Math.round(
      finishedCalls.reduce((total, call) => total + (call.effective_duration_seconds ?? call.duration_seconds ?? 0), 0) / finishedCalls.length,
    )
    : null;
  const lastFinishedCall = finishedCalls[0] || null;
  const latestCalls = calls.slice(0, 12);
  const currentTranscriptMessages = selectedCall?.transcript ? (selectedCall.transcript.messages || selectedCall.transcript.chat_history || selectedCall.transcript.telemetry_messages || []) : [];
  const filteredTranscriptMessages = currentTranscriptMessages.filter((message) => {
    if (transcriptFilter === 'all') return true;
    return transcriptFilter === 'caller' ? message.role === 'user' : message.role !== 'user';
  }).map((message, index) => ({
    id: String(index),
    timestamp: message.created_at ? new Date(message.created_at).getTime() : Date.now(),
    from: { isLocal: message.role === 'user' } as { isLocal: boolean },
    message: message.content || '',
    role: message.role || 'assistant',
  }));

  const formatDuration = (seconds: number | null) => {
    if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const launchCall = async (phoneNumber: string, mode: 'now' | 'queue', config: AgentRuntimeConfig): Promise<boolean> => {
    const normalizedNumber = phoneNumber.trim().startsWith('+') ? phoneNumber.trim() : `+91${phoneNumber.trim()}`;

    const response = await fetch('/api/outbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: normalizedNumber,
        agentConfig: config,
        mode,
      }),
    });

    const data = await response.json();
    if (data.success) {
      await fetchCalls(true);
      return true;
    }
    alert(`Failed to launch call: ${data.error}\n\n${data.details || ''}`);
    return false;
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

    setSavedPresetPrompts((current) => ({ ...current, [presetId]: data.preset.prompt }));
    setAgentConfig((current) =>
      resolveAgentRuntimeConfig(current.presetId, {
        ...current,
        prompt: data.preset.prompt,
      }),
    );
  };

  if (!isMounted) {
    return (
      <div className={styles.bootScreen}>
        <div className={styles.bootCard}>
          <span className={styles.bootPulse} />
          <h2>Loading</h2>
          <p>Syncing call state...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell
      onNewCall={() => setIsModalOpen(true)}
      error={error}
      onErrorClose={() => setError(null)}
    >
      <header className={styles.topBar}>
        <div>
          <p className={styles.topBarKicker}>
            System / <span style={{ color: 'var(--foreground)' }}>Dashboard</span>
          </p>
          <h1 className={styles.topBarTitle}>Overview</h1>
        </div>

        <div className={styles.toolbar}>
          <div className={`${styles.agentStateBadge} ${activeJobs.length > 0 ? styles.agentStateBusy : styles.agentStateIdle}`}>
            <span style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'currentColor',
              marginRight: '6px'
            }} />
            {activeJobs.length > 0 ? `${activeJobs.length} active` : 'Idle'}
          </div>
          <button type="button" className={styles.secondaryBtn} onClick={() => fetchCalls()} disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            {isLoading ? 'Syncing' : 'Sync'}
          </button>
          <button type="button" className={styles.smallButton}>
            <Search size={14} />
          </button>
        </div>
      </header>

      <section id="overview" className={styles.dashboardTop}>
        <div className={styles.statusCard}>
          <span>Queued</span>
          <strong>{calls.filter(c => c.status === 'queued').length}</strong>
        </div>
        <div className={styles.statusCard}>
          <span>Active</span>
          <strong>{activeJobs.length}</strong>
        </div>
        <div className={styles.statusCard}>
          <span>Completed</span>
          <strong>{calls.filter(c => c.status === 'completed').length}</strong>
        </div>
        <div className={styles.statusCard}>
          <span>Failed</span>
          <strong>{calls.filter(c => c.status === 'failed').length}</strong>
        </div>
        <div className={styles.statusCard}>
          <span>Total Calls</span>
          <strong>{calls.length}</strong>
        </div>
      </section>

      <section className={`${styles.agentAccordion} ${isAccordionOpen ? styles.accordionOpen : ''}`}>
        <div className={styles.accordionHeader} onClick={() => setIsAccordionOpen(!isAccordionOpen)}>
          <div className={styles.accordionInfo}>
            <div className={styles.agentNameTag}>
              <h3>{agentConfig.presetId.charAt(0).toUpperCase() + agentConfig.presetId.slice(1).replace(/-/g, ' ')}</h3>
              <span className={styles.agentStatusBadge}>Active Preset</span>
            </div>
            <div className={styles.summary} style={{ margin: 0, border: 'none', background: 'transparent' }}>
              <div>
                <span className={styles.summaryLabel}>Arch</span>
                <strong>{agentConfig.presetId}</strong>
              </div>
              <div>
                <span className={styles.summaryLabel}>Inf</span>
                <strong>{agentConfig.llmModel}</strong>
              </div>
              <div>
                <span className={styles.summaryLabel}>Syn</span>
                <strong>{agentConfig.ttsModel}</strong>
              </div>
            </div>
          </div>

          <div className={styles.accordionActions}>
            <button
              type="button"
              className={styles.smallButton}
              onClick={(e) => {
                e.stopPropagation();
                setIsTestAgentOpen(true);
              }}
              style={{ background: 'var(--accent)', color: 'white', borderColor: 'var(--accent-strong)' }}
            >
              <MonitorPlay size={14} />
              Web Test
            </button>
            <ChevronDown size={18} className={styles.accordionToggleIcon} />
          </div>
        </div>

        <div className={styles.accordionBody}>
          <AgentSettingsPanel
            value={agentConfig}
            onChange={setAgentConfig}
            onSavePrompt={handleSavePrompt}
            promptOverrides={savedPresetPrompts}
          />
        </div>
      </section>

      <section id="activity" className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>Recent Activity</p>
            <h2>Call Logs</h2>
          </div>
        </div>

        {calls.length === 0 ? (
          <div className={styles.emptyState}>
            <HistoryIcon size={32} style={{ opacity: 0.2, marginBottom: '0.5rem' }} />
            <p>No call logs yet.</p>
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Destination</th>
                  <th>Duration</th>
                  <th>Campaign / Type</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {latestCalls.map((call) => {
                  const campaign = campaigns.find(c => c.id === (call as any).campaign_id);
                  return (
                    <tr key={call.id} onClick={() => setSelectedCall(call)} className={styles.tableRow}>
                      <td>{new Date(call.created_at).toLocaleString()}</td>
                      <td>{call.phone_number}</td>
                      <td>{formatDuration(call.effective_duration_seconds ?? call.duration_seconds)}</td>
                      <td>
                        {campaign ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Layers size={14} />
                            {campaign.name}
                          </span>
                        ) : (
                          <span style={{ opacity: 0.6 }}>Single Call</span>
                        )}
                      </td>
                      <td>
                        <span className={`${styles.statusBadge} ${styles[call.status] || styles.ringing}`}>
                          {call.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedCall && (
        <div className={styles.drawerOverlay} onClick={() => setSelectedCall(null)}>
          <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <div>
                <p className={styles.drawerKicker}>Transcript</p>
                <h2>{selectedCall.phone_number}</h2>
              </div>
              <button onClick={() => setSelectedCall(null)} className={styles.smallButton}>
                <X size={18} />
              </button>
            </div>
            <div className={styles.transcriptContainer}>
              <div className={styles.callStatGrid}>
                <div className={styles.callStat}>
                  <span>Number</span>
                  <strong>{selectedCall.phone_number}</strong>
                </div>
                <div className={styles.callStat}>
                  <span>Status</span>
                  <strong>{selectedCall.status}</strong>
                </div>
              </div>
              {selectedCall.transcript?.summary && (
                <div className={styles.promptSnippet}>
                  <strong>Summary:</strong>
                  <p>{selectedCall.transcript.summary}</p>
                </div>
              )}
              <AgentChatTranscript messages={filteredTranscriptMessages} />
            </div>
          </div>
        </div>
      )}

      <NewCallModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onLaunch={launchCall}
        queuedCount={queuedCalls.length}
        availablePresetIds={AGENT_PRESETS.map(p => p.id)}
        defaultAgentConfig={agentConfig}
      />

      <VoiceAgentDialog
        isOpen={isTestAgentOpen}
        onClose={() => setIsTestAgentOpen(false)}
        agentConfig={agentConfig}
      />
    </DashboardShell>
  );
}
