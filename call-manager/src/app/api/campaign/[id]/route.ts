import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase.from('campaigns').select('*').eq('id', params.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const body = await req.json();
  const action = body?.action;

  if (!['start_now', 'pause', 'resume'].includes(action)) {
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  }

  let update: Record<string, unknown> = {};
  if (action === 'start_now') {
    update = { starts_at: new Date().toISOString(), status: 'running' };
  } else if (action === 'pause') {
    update = { status: 'paused' };
  } else if (action === 'resume') {
    update = { status: 'running' };
  }

  const { data, error } = await supabase.from('campaigns').update(update).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}
