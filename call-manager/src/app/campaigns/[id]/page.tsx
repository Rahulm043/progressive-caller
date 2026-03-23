'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';
import { AgentChatTranscript } from '@/components/agent-chat-transcript';

type TranscriptMessage = {
  type?: 'message';
  role?: string;
  content?: string;
  created_at?: string;
};

type AgentConfigSnapshot = {
  prompt?: string;
  llmModel?: string;
  llm_model?: string;
  ttsModel?: string;
  tts_model?: string;
  sttModel?: string;
  stt_model?: string;
};

interface Campaign {
  id: string;
  name: string;
  preset_id: string;
  status: string;
  starts_at: string | null;
  created_at: string;
  agent_config_snapshot: AgentConfigSnapshot | null;
}

interface Call {
  id: string;
  phone_number: string;
  status: string;
  effective_status?: string;
  is_active?: boolean;
  effective_duration_seconds?: number | null;
  sequence?: number | null;
  starts_at?: string | null;
  created_at: string;
  duration_seconds: number | null;
  transcript: TranscriptMessage[] | {
    messages?: TranscriptMessage[];
    chat_history?: TranscriptMessage[];
    telemetry_messages?: TranscriptMessage[];
  } | null;
}

export default function CampaignDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, callsRes] = await Promise.all([
        fetch(`/api/campaign/${id}`),
        fetch(`/api/calls?campaignId=${id}`),
      ]);
      const cData = await cRes.json();
      const callsData = await callsRes.json();
      if (!cRes.ok) throw new Error(cData?.error || 'Failed to load campaign');
      if (!callsRes.ok) throw new Error(callsData?.error || 'Failed to load calls');
      setCampaign(cData.campaign);
      setCalls(callsData.calls || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load campaign');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetchData();
    const timer = window.setInterval(() => {
      fetchData();
    }, 5000);
    return () => {
      window.clearInterval(timer);
    };
  }, [id, fetchData]);

  const mutateAction = async (action: 'start_now' | 'pause' | 'resume') => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/campaign/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to update campaign');
      setCampaign(data.campaign);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update campaign');
    } finally {
      setActionLoading(false);
    }
  };

  const queued = calls.filter((c) => c.status === 'queued').sort((a, b) => {
    if (a.sequence == null) return 1;
    if (b.sequence == null) return -1;
    return a.sequence - b.sequence;
  });
  const active = calls.filter((c) => c.is_active === true);
  const finished = calls.filter((c) => ['completed', 'failed'].includes(c.status));
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [filter, setFilter] = useState<'all' | 'user' | 'agent'>('all');
  const transcriptMessages = (call: Call | null) => {
    if (!call || !call.transcript) return [];
    const transcript = call.transcript;
    const messages = Array.isArray(transcript)
      ? transcript
      : transcript.messages || transcript.chat_history || transcript.telemetry_messages || [];
    return messages.map((message: TranscriptMessage, index: number) => ({
      id: index.toString(),
      timestamp: message.created_at ? new Date(message.created_at).getTime() : Date.now(),
      from: { isLocal: message.role === 'user' } as { isLocal: boolean },
      message: message.content || '',
    }));
  };

  const filteredTranscriptMessages = (call: Call | null) => {
    const msgs = transcriptMessages(call);
    if (filter === 'all') return msgs;
    const isUser = filter === 'user';
    return msgs.filter((m) => m.from.isLocal === isUser);
  };

  return (
    <div className={styles.shell}>
      {loading ? (
        <div className={styles.card}>Loading...</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : campaign ? (
        <>
          <div className={styles.header}>
            <div>
              <p className={styles.kicker}>Campaign</p>
              <h1>{campaign.name}</h1>
              <p className={styles.meta}>Preset {campaign.preset_id} • Created {new Date(campaign.created_at).toLocaleString()}</p>
              <p className={styles.meta}>
                {campaign.starts_at ? `Starts at ${new Date(campaign.starts_at).toLocaleString()}` : 'Starts immediately'}
              </p>
            </div>
            <div className={styles.actions}>
              <Link href="/campaigns">All campaigns</Link>
              <button disabled={actionLoading} onClick={() => mutateAction('start_now')}>Start now</button>
              {campaign.status === 'paused' ? (
                <button disabled={actionLoading} onClick={() => mutateAction('resume')}>Resume</button>
              ) : (
                <button disabled={actionLoading} onClick={() => mutateAction('pause')}>Pause</button>
              )}
            </div>
          </div>

          <div className={styles.grid}>
            <div className={styles.card}>
              <p className={styles.kicker}>Queued</p>
              <h3>{queued.length}</h3>
              {queued[0] && (
                <p className={styles.meta}>
                  Next: {queued[0].phone_number} | Seq {queued[0].sequence ?? '--'}
                  {queued[0].starts_at && ` | starts ${new Date(queued[0].starts_at).toLocaleTimeString()}`}
                </p>
              )}
            </div>
            <div className={styles.card}>
              <p className={styles.kicker}>Active</p>
              <h3>{active.length}</h3>
            </div>
            <div className={styles.card}>
              <p className={styles.kicker}>Completed</p>
              <h3>{finished.length}</h3>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Agent snapshot</h2>
            </div>
            <div className={styles.snapshotGrid}>
              <div className={styles.card}>
                <p className={styles.kicker}>Preset</p>
                <strong>{campaign.preset_id}</strong>
              </div>
              <div className={styles.card}>
                <p className={styles.kicker}>LLM</p>
                <strong>{campaign.agent_config_snapshot?.llmModel || campaign.agent_config_snapshot?.llm_model || '--'}</strong>
              </div>
              <div className={styles.card}>
                <p className={styles.kicker}>TTS</p>
                <strong>{campaign.agent_config_snapshot?.ttsModel || campaign.agent_config_snapshot?.tts_model || '--'}</strong>
              </div>
              <div className={styles.card}>
                <p className={styles.kicker}>STT</p>
                <strong>{campaign.agent_config_snapshot?.sttModel || campaign.agent_config_snapshot?.stt_model || '--'}</strong>
              </div>
            </div>
            {campaign.agent_config_snapshot?.prompt && (
              <div className={styles.card} style={{ marginTop: '0.75rem' }}>
                <p className={styles.kicker}>Prompt</p>
                <p className={styles.meta}>{campaign.agent_config_snapshot.prompt}</p>
              </div>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Queued calls</h2>
            </div>
            {queued.length === 0 ? (
              <div className={styles.card}>None queued.</div>
            ) : (
              <div className={styles.list}>
                {queued.map((c) => (
                  <div key={c.id} className={styles.row}>
                    <span>{c.phone_number}</span>
                    <span className={styles.meta}>Seq {c.sequence ?? '--'}</span>
                    <span className={styles.meta}>{c.starts_at ? new Date(c.starts_at).toLocaleTimeString() : 'now'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>In progress</h2>
            </div>
            {active.length === 0 ? (
              <div className={styles.card}>None active.</div>
            ) : (
              <div className={styles.list}>
                {active.map((c) => (
                  <div key={c.id} className={styles.row}>
                    <span>{c.phone_number}</span>
                    <span className={styles.meta}>{c.effective_status || c.status}</span>
                    <span className={styles.meta}>Seq {c.sequence ?? '--'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Completed / Failed</h2>
            </div>
            {finished.length === 0 ? (
              <div className={styles.card}>No completed calls yet.</div>
            ) : (
              <div className={styles.list}>
                {finished.map((c) => (
                  <div key={c.id} className={styles.row} onClick={() => setSelectedCall(c)}>
                    <span>{c.phone_number}</span>
                    <span className={styles.meta}>{c.status}</span>
                    <span className={styles.meta}>{new Date(c.created_at).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {selectedCall && (
            <div className={styles.drawerOverlay} onClick={() => setSelectedCall(null)}>
              <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
                <div className={styles.drawerHeader}>
                  <div>
                    <p className={styles.kicker}>Call log</p>
                    <h3>{selectedCall.phone_number}</h3>
                    <p className={styles.meta}>{selectedCall.effective_status || selectedCall.status}</p>
                  </div>
                  <button className={styles.closeBtn} onClick={() => setSelectedCall(null)}>Close</button>
                </div>
                <div className={styles.filterBar}>
                  <button
                    className={`${styles.filterBtn} ${filter === 'all' ? styles.filterActive : ''}`}
                    onClick={() => setFilter('all')}
                  >
                    All
                  </button>
                  <button
                    className={`${styles.filterBtn} ${filter === 'user' ? styles.filterActive : ''}`}
                    onClick={() => setFilter('user')}
                  >
                    Caller
                  </button>
                  <button
                    className={`${styles.filterBtn} ${filter === 'agent' ? styles.filterActive : ''}`}
                    onClick={() => setFilter('agent')}
                  >
                    Agent
                  </button>
                </div>
                <AgentChatTranscript messages={filteredTranscriptMessages(selectedCall)} style={{ height: '50vh' }} />
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
