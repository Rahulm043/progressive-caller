'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

interface Campaign {
  id: string;
  name: string;
  preset_id: string;
  status: string;
  starts_at: string | null;
  created_at: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaigns = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/campaigns');
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
  }, []);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Campaigns</p>
          <h1>Outbound Campaigns</h1>
          <p className={styles.subhead}>Scheduled and active batches with their agent presets.</p>
        </div>
        <button className={styles.refreshBtn} onClick={fetchCampaigns} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.grid}>
        {loading && campaigns.length === 0 ? (
          <div className={styles.card}>Loading campaigns…</div>
        ) : campaigns.length === 0 ? (
          <div className={styles.card}>No campaigns yet. Upload a CSV from the main dashboard to create one.</div>
        ) : (
          campaigns.map((c) => (
            <Link key={c.id} href={`/campaigns/${c.id}`} className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.status}>{c.status}</span>
                <span className={styles.preset}>{c.preset_id}</span>
              </div>
              <h3>{c.name}</h3>
              <p className={styles.meta}>
                {c.starts_at
                  ? `Starts ${new Date(c.starts_at).toLocaleString()}`
                  : 'Starts immediately'}
              </p>
              <p className={styles.meta}>Created {new Date(c.created_at).toLocaleString()}</p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
