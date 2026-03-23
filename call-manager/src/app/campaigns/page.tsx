'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardShell } from '@/components/DashboardShell';
import { NewCallModal } from '@/components/NewCallModal';
import { AgentRuntimeConfig, DEFAULT_AGENT_RUNTIME_CONFIG, AGENT_PRESETS } from '@/lib/agent-presets';
import styles from './page.module.css';

interface Campaign {
  id: string;
  name: string;
  preset_id: string;
  status: string;
  starts_at: string | null;
  created_at: string;
  agent_prompt?: string;
  stats?: {
    queued: number;
    active: number;
    completed: number;
    failed: number;
    total: number;
  };
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [agentConfig, setAgentConfig] = useState<AgentRuntimeConfig>(DEFAULT_AGENT_RUNTIME_CONFIG);

  const fetchCampaigns = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/campaigns/summary');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load campaigns');
      setCampaigns(data.campaigns || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    const timer = window.setInterval(() => {
      fetchCampaigns();
    }, 7000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

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
          <p className={styles.kicker}>Campaigns</p>
          <h1>Campaign Registry</h1>
          <p className={styles.subhead}>Monitor performance and manage automated calling sequences.</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/campaigns/new" className={styles.primaryBtn}>
            New campaign
          </Link>
          <button className={styles.refreshBtn} onClick={fetchCampaigns} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className={styles.heroStrip}>
        <div className={styles.heroMetric}>
          <span>Campaigns Total</span>
          <strong>{campaigns.length}</strong>
        </div>
        <div className={styles.heroMetric}>
          <span>Active / Running</span>
          <strong>{campaigns.filter((campaign) => campaign.status === 'running').length}</strong>
        </div>
        <div className={styles.heroMetric}>
          <span>Draft / Scheduled</span>
          <strong>{campaigns.filter((campaign) => campaign.status !== 'running').length}</strong>
        </div>
      </div>

      <div className={styles.grid}>
        {loading && campaigns.length === 0 ? (
          <div className={styles.blankCard}>Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <div className={`${styles.blankCard} ${styles.blankWide}`}>
            <h3>No campaigns yet</h3>
            <p>Create your first calling run to see the big preview cards and live stats here.</p>
            <Link href="/campaigns/new" className={styles.primaryBtn}>
              New campaign
            </Link>
          </div>
        ) : (
          campaigns.map((c) => {
            const progress = c.stats && c.stats.total > 0 ? Math.min(100, Math.round((c.stats.completed / c.stats.total) * 100)) : 0;

            return (
              <Link key={c.id} href={`/campaigns/${c.id}`} className={styles.card}>
                <div className={styles.cardTop}>
                  <div>
                    <span className={styles.statusBadge}>{c.status}</span>
                    <h3>{c.name}</h3>
                  </div>
                  <span className={styles.preset}>{c.preset_id}</span>
                </div>

                <p className={styles.meta}>
                  {c.starts_at ? `Starts ${new Date(c.starts_at).toLocaleString()}` : 'Starts immediately'}
                </p>

                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                </div>

                <div className={styles.statGrid}>
                  <div>
                    <span>Queued</span>
                    <strong>{c.stats?.queued ?? 0}</strong>
                  </div>
                  <div>
                    <span>Active</span>
                    <strong>{c.stats?.active ?? 0}</strong>
                  </div>
                  <div>
                    <span>Done</span>
                    <strong>{c.stats?.completed ?? 0}</strong>
                  </div>
                  <div>
                    <span>Total</span>
                    <strong>{c.stats?.total ?? 0}</strong>
                  </div>
                </div>

                {c.agent_prompt && (
                  <p className={styles.promptSnippet}>
                    {c.agent_prompt.slice(0, 130)}
                    {c.agent_prompt.length > 130 ? '...' : ''}
                  </p>
                )}
              </Link>
            );
          })
        )}
      </div>

      <NewCallModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onLaunch={launchCall}
        queuedCount={0} // Simple assumption for now
        availablePresetIds={AGENT_PRESETS.map(p => p.id)}
        defaultAgentConfig={agentConfig}
      />
    </DashboardShell>
  );
}
