import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const ACTIVE_STALE_SECONDS = Number(process.env.DASHBOARD_ACTIVE_STALE_SECONDS || 600);

type CampaignRow = {
  id: string;
  name: string;
  preset_id: string;
  status: string;
  starts_at: string | null;
  created_at: string;
  agent_config_snapshot: Record<string, unknown> | null;
};

export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const now = Date.now();

  const { data: campaigns, error: campErr } = await supabase
    .from('campaigns')
    .select('id, name, preset_id, status, starts_at, created_at, agent_config_snapshot')
    .order('created_at', { ascending: false });

  if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 });
  if (!campaigns || campaigns.length === 0) return NextResponse.json({ campaigns: [] });

  const ids = campaigns.map((c) => c.id);
  const { data: calls, error: callsErr } = await supabase
    .from('calls')
    .select('id, campaign_id, status, created_at')
    .in('campaign_id', ids);

  if (callsErr) return NextResponse.json({ error: callsErr.message }, { status: 500 });

  const statsMap: Record<
    string,
    { queued: number; active: number; completed: number; failed: number; total: number }
  > = {};

  campaigns.forEach((c) => {
    statsMap[c.id] = { queued: 0, active: 0, completed: 0, failed: 0, total: 0 };
  });

  (calls || []).forEach((call) => {
    const bucket = statsMap[call.campaign_id as string];
    if (!bucket) return;
    const createdAtMs = new Date(call.created_at as string).getTime();
    const ageSeconds = Number.isFinite(createdAtMs) ? Math.max(0, Math.floor((now - createdAtMs) / 1000)) : 0;
    const isStaleActive = ['dispatching', 'ringing', 'connected', 'in_progress'].includes(call.status as string)
      && ageSeconds > ACTIVE_STALE_SECONDS;

    bucket.total += 1;
    if (call.status === 'queued') bucket.queued += 1;
    else if (['dispatching', 'ringing', 'connected', 'in_progress'].includes(call.status) && !isStaleActive) bucket.active += 1;
    else if (call.status === 'completed') bucket.completed += 1;
    else if (call.status === 'failed') bucket.failed += 1;
  });

  const merged = campaigns.map((c: CampaignRow) => {
    const snapshot = c.agent_config_snapshot || {};
    const prompt = typeof snapshot?.prompt === 'string' ? snapshot.prompt : '';
    const stats = statsMap[c.id] || { queued: 0, active: 0, completed: 0, failed: 0, total: 0 };
    const startsAtMs = c.starts_at ? new Date(c.starts_at).getTime() : null;
    const isFuture = typeof startsAtMs === 'number' && startsAtMs > now;
    const computedStatus =
      c.status === 'paused'
        ? 'paused'
        : stats.total > 0 && stats.queued === 0 && stats.active === 0
          ? (stats.completed > 0 ? 'completed' : 'failed')
          : isFuture && stats.completed === 0 && stats.failed === 0 && stats.active === 0
            ? 'scheduled'
            : 'running';

    return {
      ...c,
      status: computedStatus,
      agent_prompt: prompt,
      stats,
    };
  });

  return NextResponse.json({ campaigns: merged });
}
