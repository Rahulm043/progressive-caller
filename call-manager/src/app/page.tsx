'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Users,
  Plus,
  PhoneCall,
  Activity,
  Clock,
  ChevronRight
} from 'lucide-react';
import { NewCallModal } from '@/components/NewCallModal';
import { AgentSettingsPanel } from '@/components/AgentSettingsPanel';
import { VoiceAgentDialog } from '@/components/VoiceAgentDialog';
import { createClient } from '@supabase/supabase-js';
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

interface Call {
  id: string;
  phone_number: string;
  status: string;
  created_at: string;
  duration_seconds: number | null;
  transcript: TranscriptPayload | null;
  livekit_room_name?: string | null;
  dispatch_id?: string | null;
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

  const syncSelectedCall = (nextCalls: Call[]) => {
    setSelectedCall((current) => {
      if (!current) return current;
      const updated = nextCalls.find((call) => call.id === current.id);
      return updated ?? current;
    });
  };

  const fetchCalls = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setIsLoading(true);
    }
    setError(null);
    try {
      console.log('Fetching calls from Supabase...');
      const { data, error: sbError } = await supabase
        .from('calls')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (sbError) {
        console.error('Supabase Error:', sbError);
        setError(`Supabase Error: ${sbError.message} (Code: ${sbError.code})`);
      } else {
        console.log('Fetched calls:', data?.length || 0);
        const nextCalls = data || [];
        setCalls(nextCalls);
        syncSelectedCall(nextCalls);
      }
    } catch (error: unknown) {
      console.error('Fetch exception:', error);
      setError(`Connection Exception: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, []);

  const clearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear ALL call logs from the database?')) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('calls')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

      if (error) throw error;
      setCalls([]);
    } catch (error: unknown) {
      console.error('Error clearing logs:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchCalls();

    // Subscribe to changes
    console.log('Subscribing to Supabase changes...');
    const channel = supabase
      .channel('calls-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, (payload) => {
        const nextCall = payload.new as Call;
        if (payload.eventType === 'INSERT') {
          setCalls(prev => [nextCall, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setCalls(prev => prev.map(c => c.id === nextCall.id ? nextCall : c));
        }
        setSelectedCall(prev => (prev && prev.id === nextCall.id ? nextCall : prev));
      })
      .subscribe();

    const refreshTimer = window.setInterval(() => {
      fetchCalls({ silent: true });
    }, 4000);

    return () => {
      window.clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchCalls]);

  useEffect(() => {
    if (!isMounted || typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem(AGENT_RUNTIME_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Partial<AgentRuntimeConfig> & { presetId?: string };
      const presetId = parsed.presetId || DEFAULT_AGENT_RUNTIME_CONFIG.presetId;
      setAgentConfig(resolveAgentRuntimeConfig(presetId, parsed));
    } catch (storageError) {
      console.warn('Failed to load agent settings from localStorage:', storageError);
    }
  }, [isMounted]);

  useEffect(() => {
    if (!isMounted || typeof window === 'undefined') return;
    window.localStorage.setItem(AGENT_RUNTIME_STORAGE_KEY, JSON.stringify(agentConfig));
  }, [agentConfig, isMounted]);

  const activeJobs = calls.filter(c => c.status === 'queued' || c.status === 'dispatching' || c.status === 'in_progress');
  const finishedCalls = calls.filter(c => c.status === 'completed' || c.status === 'failed');

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const text = await file.text();
      const numbers = text.split(/[\n,]/).map(n => n.trim()).filter(n => n.length > 5);

      if (numbers.length === 0) {
        alert('No valid numbers found in CSV');
        return;
      }

      const response = await fetch('/api/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumbers: numbers,
          agentConfig,
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert(`Successfully queued ${data.queuedCount} calls!`);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to parse and upload CSV');
    } finally {
      setIsUploading(false);
      if (event.target) event.target.value = '';
    }
  };

  const launchCall = async (phoneNumber: string) => {
    try {
      const response = await fetch('/api/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: `+91${phoneNumber}`,
          agentConfig,
        }),
      });

      const data = await response.json();

      if (data.success) {
        await fetchCalls({ silent: true });
      } else {
        alert(`Failed to launch call: ${data.error}\n\n${data.details || ''}`);
      }
    } catch (error) {
      console.error('Launch error:', error);
      alert('Network error launching call');
    }
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
    return messages.map((m, i) => ({
      id: i.toString(),
      timestamp: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
      from: { isLocal: m.role === 'user' } as { isLocal: boolean },
      message: m.content || ''
    }));
  };

  const getTranscriptSummary = (transcript: TranscriptPayload | TranscriptMessage[] | null | undefined) => {
    if (!transcript || Array.isArray(transcript)) return null;
    return transcript.summary || null;
  };

  const getTranscriptMetrics = (transcript: TranscriptPayload | TranscriptMessage[] | null | undefined) => {
    if (!transcript || Array.isArray(transcript)) return [];
    const metrics = transcript.important_events || transcript.events || transcript.metrics || [];
    const filtered = metrics.filter(item => {
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
      payload: item.payload || item.metrics
    }));
  };

  if (!isMounted) return <div className="app-container" style={{ background: '#0f172a', height: '100vh' }} />;

  return (
    <div className="app-container">
      {/* Error Alert */}
      {error && (
        <div style={{
          position: 'fixed',
          top: '1rem',
          right: '1rem',
          background: '#fee2e2',
          color: '#b91c1c',
          padding: '1rem',
          borderRadius: '0.5rem',
          zIndex: 1000,
          border: '1px solid #fca5a5',
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
        }}>
          <strong>Connection Issue:</strong> {error}
          <button onClick={() => setError(null)} style={{ marginLeft: '1rem', border: 'none', background: 'transparent', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {/* Sidebar */}
      <aside className="sidebar">
        <div className={styles.brand}>
          <div className={styles.logo}>V</div>
          <span>Vobiz AI</span>
        </div>

        <nav className={styles.nav}>
          <a href="#" className={`${styles.navItem} ${styles.active}`}>
            <LayoutDashboard size={20} /> Observer
          </a>
          <a href="#" className={styles.navItem}>
            <Activity size={20} /> Real-time Logs
          </a>
          <a href="#" className={styles.navItem}>
            <Clock size={20} /> History
          </a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className={styles.header}>
          <div>
            <h1>Call Manager</h1>
            <p className={styles.subtitle}>Real-time observation of your LiveKit Cloud Agent.</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <input
              type="file"
              id="csvUpload"
              accept=".csv,.txt"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <button
              className={styles.primaryBtn}
              style={{ background: '#334155', color: '#f8fafc', boxShadow: 'none' }}
              onClick={() => document.getElementById('csvUpload')?.click()}
              disabled={isUploading}
            >
              <Users size={20} /> {isUploading ? 'Uploading...' : 'Upload CSV'}
            </button>
            <button className={styles.primaryBtn} onClick={() => setIsModalOpen(true)}>
              <Plus size={20} /> Launch New Call
            </button>
            <button className={styles.primaryBtn} style={{ background: '#1f2937', color: '#f8fafc', boxShadow: 'none' }} onClick={() => setIsTestAgentOpen(true)}>
              <PhoneCall size={20} /> Talk to Agent
            </button>
          </div>
        </header>

        <section style={{ margin: '1.5rem 0 2rem' }}>
          <AgentSettingsPanel value={agentConfig} onChange={setAgentConfig} />
        </section>

        <VoiceAgentDialog
          isOpen={isTestAgentOpen}
          onClose={() => setIsTestAgentOpen(false)}
          agentConfig={agentConfig}
        />

        {/* Stats Grid */}
        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Total Opportunities</span>
            <span className={styles.statValue}>{calls.length}</span>
            <span className={styles.statTrend}>+12% from last campaign</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Successful Connections</span>
            <span className={styles.statValue}>{finishedCalls.filter(c => c.status === 'completed').length}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Active Queued</span>
            <span className={styles.statValue}>{activeJobs.length}</span>
          </div>
        </section>

        {/* Live Monitor */}
        <section>
          <div className={styles.sectionHeader}>
            <Activity size={18} />
            <h2>Active Agent Jobs ({activeJobs.length})</h2>
          </div>
          <div className={styles.liveGrid}>
            {activeJobs.length === 0 ? (
              <div className={styles.emptyState}>
                <PhoneCall size={40} />
                <p>No active agent jobs detecting.</p>
                <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>If you just launched a call, wait a few seconds for it to appear or check the raw logs below.</span>
              </div>
            ) : (
              activeJobs.map(call => (
                <div key={call.id} className={styles.callCard}>
                  <div className={styles.callCardHeader}>
                    <span className={styles.phoneNumber}>{call.phone_number}</span>
                    <span className={`${styles.statusBadge} ${call.status === 'in_progress' ? styles.connected : styles.ringing}`}>
                      {call.status.toUpperCase()}
                    </span>
                  </div>
                  <div className={styles.callDetails}>
                    <small>Started: {new Date(call.created_at).toLocaleTimeString()}</small><br />
                    <small>ID: {call.id.slice(0, 8)}...</small>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Real Logs Placeholder */}
        <section>
          <div className={styles.sectionHeader} style={{ justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Clock size={18} />
              <h2>Recent Call Logs ({finishedCalls.length})</h2>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => console.log('Raw Supabase Data:', calls)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--card-border)',
                  color: '#94a3b8',
                  padding: '0.4rem 0.8rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                Log to Console
              </button>
              <button
                onClick={clearLogs}
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: '#ef4444',
                  padding: '0.4rem 0.8rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
                disabled={isLoading}
              >
                Clear Logs
              </button>
              <button
                onClick={() => fetchCalls()}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--card-border)',
                  color: '#94a3b8',
                  padding: '0.4rem 0.8rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
                disabled={isLoading}
              >
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
          <div className={styles.tableCard}>
            {isLoading && calls.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#475569' }}>
                <div className={styles.ringing} style={{ display: 'inline-block', padding: '0.5rem 1rem', borderRadius: '100px', marginBottom: '1rem' }}>Loading data...</div>
                <p>Connecting to Supabase...</p>
              </div>
            ) : calls.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#475569' }}>
                <p>No records at all found in the &apos;calls&apos; table.</p>
                <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>Try launching a call to create a record.</span>
              </div>
            ) : finishedCalls.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#475569' }}>
                <p>{calls.length} entries found, but none are &quot;completed&quot; yet.</p>
                <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>Check the &quot;Active Agent Jobs&quot; grid above.</span>
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
                  {finishedCalls.map(call => (
                    <tr key={call.id} onClick={() => setSelectedCall(call)} style={{ cursor: 'pointer' }}>
                      <td className={styles.tdPhone}>{call.phone_number}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${call.status === 'completed' ? styles.completed : styles.ringing}`} style={call.status === 'failed' ? { background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' } : {}}>
                          {call.status.toUpperCase()}
                        </span>
                      </td>
                      <td className={styles.tdDuration}>{formatDuration(call.duration_seconds)}</td>
                      <td className={styles.tdTime}>{new Date(call.created_at).toLocaleDateString()} {new Date(call.created_at).toLocaleTimeString()}</td>
                      <td className={styles.tdAction}>
                        <ChevronRight size={16} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Transcript Drawer */}
        {selectedCall && (
          <div className={styles.drawerOverlay} onClick={() => setSelectedCall(null)}>
            <div className={styles.drawer} onClick={e => e.stopPropagation()}>
              <div className={styles.drawerHeader}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Call Transcript</h2>
                  <p style={{ color: '#64748b', fontSize: '0.875rem' }}>{selectedCall.phone_number} &bull; {new Date(selectedCall.created_at).toLocaleString()}</p>
                </div>
                <button
                  onClick={() => setSelectedCall(null)}
                  style={{ background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer' }}
                >
                  <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
                </button>
              </div>
              <div className={styles.transcriptContainer} style={{ display: 'grid', gap: '1rem' }}>
                {getTranscriptSummary(selectedCall.transcript) && (
                  <div style={{
                    background: 'rgba(15, 23, 42, 0.55)',
                    border: '1px solid rgba(148, 163, 184, 0.15)',
                    borderRadius: '0.9rem',
                    padding: '1rem'
                  }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#cbd5e1' }}>
                      Call Summary
                    </div>
                    <div style={{ color: '#e2e8f0', lineHeight: 1.6 }}>
                      {getTranscriptSummary(selectedCall.transcript)}
                    </div>
                  </div>
                )}

                {getTranscriptMessages(selectedCall.transcript).length > 0 ? (
                  <AgentChatTranscript
                    messages={getTranscriptMessages(selectedCall.transcript)}
                    style={{ height: '100%' }}
                  />
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                    No transcript available for this call.
                  </div>
                )}

                {getTranscriptMetrics(selectedCall.transcript).length > 0 && (
                  <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.15)', paddingTop: '1rem' }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: '#cbd5e1' }}>
                      Important Call Events
                    </div>
                    <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '180px', overflow: 'auto' }}>
                      {getTranscriptMetrics(selectedCall.transcript).map(metric => (
                        <div
                          key={metric.id}
                          style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(148, 163, 184, 0.15)',
                            borderRadius: '0.75rem',
                            padding: '0.65rem 0.8rem',
                            fontSize: '0.8rem',
                            color: '#cbd5e1'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                            <span>{metric.label}</span>
                            <span>{metric.latency !== null && metric.latency !== undefined ? `${metric.latency.toFixed(2)} ms` : '--'}</span>
                          </div>
                          <div style={{ color: '#94a3b8', marginTop: '0.25rem' }}>
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
      />
    </div>
  );
}
