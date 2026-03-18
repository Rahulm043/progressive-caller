'use client';

import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Settings,
  Plus,
  PhoneCall,
  Activity,
  Clock,
  ChevronRight
} from 'lucide-react';
import { NewCallModal } from '@/components/NewCallModal';
import { createClient } from '@supabase/supabase-js';
import { AgentChatTranscript } from '@/components/agent-chat-transcript';
import styles from './page.module.css';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface Call {
  id: string;
  phone_number: string;
  status: string;
  created_at: string;
  duration_seconds: number | null;
  transcript: any[] | null;
}

export default function Dashboard() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [calls, setCalls] = useState<Call[]>([]);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCalls = async () => {
    setIsLoading(true);
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
        setCalls(data || []);
      }
    } catch (e: any) {
      console.error('Fetch exception:', e);
      setError(`Connection Exception: ${e.message}`);
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
        if (payload.eventType === 'INSERT') {
          setCalls(prev => [payload.new as Call, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setCalls(prev => prev.map(c => c.id === payload.new.id ? payload.new as Call : c));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
        body: JSON.stringify({ phoneNumbers: numbers }),
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
        body: JSON.stringify({ phoneNumber: `+91${phoneNumber}` }),
      });

      const data = await response.json();

      if (data.success) {
        // We rely on real-time subscription to add the new record
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

  const mapToTranscriptMessages = (transcript: any[]) => {
    return transcript.map((m, i) => ({
      id: i.toString(),
      timestamp: Date.now(),
      from: { isLocal: m.role === 'user' } as any,
      message: m.content
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
          </div>
        </header>

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
            <h2>Active Agent Jobs</h2>
          </div>
          <div className={styles.liveGrid}>
            {activeJobs.length === 0 ? (
              <div className={styles.emptyState}>
                <PhoneCall size={40} />
                <p>No active agent jobs detecting.</p>
                <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>Launch a call above to start monitoring.</span>
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
              <h2>Recent Call Logs</h2>
            </div>
            <button
              onClick={fetchCalls}
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
          <div className={styles.tableCard}>
            {isLoading && calls.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#475569' }}>
                <div className={styles.ringing} style={{ display: 'inline-block', padding: '0.5rem 1rem', borderRadius: '100px', marginBottom: '1rem' }}>Loading data...</div>
                <p>Connecting to Supabase...</p>
              </div>
            ) : finishedCalls.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#475569' }}>
                <p>No call logs found in database.</p>
                <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>Completed calls will appear here.</span>
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
                  <p style={{ color: '#64748b', fontSize: '0.875rem' }}>{selectedCall.phone_number} • {new Date(selectedCall.created_at).toLocaleString()}</p>
                </div>
                <button
                  onClick={() => setSelectedCall(null)}
                  style={{ background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer' }}
                >
                  <Plus size={24} style={{ transform: 'rotate(45deg)' }} />
                </button>
              </div>
              <div className={styles.transcriptContainer}>
                {selectedCall.transcript && selectedCall.transcript.length > 0 ? (
                  <AgentChatTranscript
                    messages={mapToTranscriptMessages(selectedCall.transcript)}
                    style={{ height: '100%' }}
                  />
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                    No transcript available for this call.
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
