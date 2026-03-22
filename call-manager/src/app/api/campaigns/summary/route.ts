import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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

  const { data: campaigns, error: campErr } = await supabase
    .from('campaigns')
    .select('id, name, preset_id, status, starts_at, created_at, agent_config_snapshot')
    .order('created_at', { ascending: false });

  if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 });
  if (!campaigns || campaigns.length === 0) return NextResponse.json({ campaigns: [] });

  const ids = campaigns.map((c) => c.id);
  const { data: calls, error: callsErr } = await supabase
    .from('calls')
    .select('id, campaign_id, status')
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
    bucket.total += 1;
    if (call.status === 'queued') bucket.queued += 1;
    else if (call.status === 'dispatching' || call.status === 'in_progress') bucket.active += 1;
    else if (call.status === 'completed') bucket.completed += 1;
    else if (call.status === 'failed') bucket.failed += 1;
  });

  const merged = campaigns.map((c: CampaignRow) => {
    const snapshot = c.agent_config_snapshot || {};
    const prompt = typeof snapshot?.prompt === 'string' ? snapshot.prompt : '';
    return {
      ...c,
      agent_prompt: prompt,
      stats: statsMap[c.id] || { queued: 0, active: 0, completed: 0, failed: 0, total: 0 },
    };
  });

  return NextResponse.json({ campaigns: merged });
}
