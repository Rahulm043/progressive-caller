import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const ACTIVE_STALE_SECONDS = Number(process.env.DASHBOARD_ACTIVE_STALE_SECONDS || 600);

type TranscriptMessage = {
  created_at?: string;
};

type CallRow = {
  id: string;
  created_at: string;
  status: string;
  duration_seconds: number | null;
  transcript?: unknown;
};

const ACTIVE_STATUSES = new Set(['dispatching', 'ringing', 'connected', 'in_progress']);

function parseTranscriptMessages(transcript: unknown): TranscriptMessage[] {
  if (!transcript) return [];
  if (Array.isArray(transcript)) return transcript as TranscriptMessage[];
  if (typeof transcript !== 'object') return [];

  const payload = transcript as {
    messages?: TranscriptMessage[];
    chat_history?: TranscriptMessage[];
    telemetry_messages?: TranscriptMessage[];
  };

  return payload.messages || payload.chat_history || payload.telemetry_messages || [];
}

function computeTranscriptDurationSeconds(call: CallRow): number | null {
  const messages = parseTranscriptMessages(call.transcript);
  const timestamps = messages
    .map((message) => (message.created_at ? new Date(message.created_at).getTime() : NaN))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (timestamps.length < 2) return null;
  const spanSeconds = Math.max(0, Math.round((timestamps[timestamps.length - 1] - timestamps[0]) / 1000));
  return spanSeconds > 0 ? spanSeconds : null;
}

function deriveDurationSeconds(call: CallRow): number | null {
  const baseDuration = typeof call.duration_seconds === 'number' && call.duration_seconds >= 0 ? call.duration_seconds : null;
  const transcriptDuration = computeTranscriptDurationSeconds(call);

  if (baseDuration === null) return transcriptDuration;
  if (transcriptDuration === null) return baseDuration;

  // Guard against inflated persisted durations by trusting transcript span when mismatch is large.
  if (baseDuration > Math.max(transcriptDuration * 2, transcriptDuration + 180)) {
    return transcriptDuration;
  }

  return baseDuration;
}

export async function GET(req: Request) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get('campaignId');
  const limitParam = Number(searchParams.get('limit') || 100);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 100;

  let query = supabase.from('calls').select('*').order('created_at', { ascending: false }).limit(limit);
  if (campaignId) {
    query = query.eq('campaign_id', campaignId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const calls = (data || []).map((row) => {
    const call = row as CallRow & Record<string, unknown>;
    const status = String(call.status || '').toLowerCase();
    const createdAtMs = new Date(call.created_at).getTime();
    const ageSeconds = Number.isFinite(createdAtMs) ? Math.max(0, Math.floor((now - createdAtMs) / 1000)) : 0;
    const isStaleActive = ACTIVE_STATUSES.has(status) && ageSeconds > ACTIVE_STALE_SECONDS;

    return {
      ...call,
      effective_duration_seconds: deriveDurationSeconds(call),
      effective_status: isStaleActive ? 'stale' : status,
      is_stale_active: isStaleActive,
      is_active: ACTIVE_STATUSES.has(status) && !isStaleActive,
    };
  });

  return NextResponse.json({ calls });
}
