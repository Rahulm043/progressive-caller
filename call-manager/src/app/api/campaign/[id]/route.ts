import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase.from('campaigns').select('*').eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}

export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const body = await req.json();
  const action = body?.action;

  if (!['start_now', 'pause', 'resume'].includes(action)) {
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  }

  let update: Record<string, unknown> = {};
  const nowIso = new Date().toISOString();
  if (action === 'start_now') {
    update = { starts_at: nowIso, status: 'running' };
  } else if (action === 'pause') {
    update = { status: 'paused' };
  } else if (action === 'resume') {
    update = { status: 'running' };
  }

  const { data, error } = await supabase.from('campaigns').update(update).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Align queued call scheduling with campaign control actions.
  if (action === 'start_now' || action === 'resume') {
    const { error: queueUpdateError } = await supabase
      .from('calls')
      .update({ starts_at: nowIso })
      .eq('campaign_id', id)
      .eq('status', 'queued')
      .or(`starts_at.is.null,starts_at.gt.${nowIso}`);

    if (queueUpdateError) {
      return NextResponse.json({ error: queueUpdateError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ campaign: data });
}
