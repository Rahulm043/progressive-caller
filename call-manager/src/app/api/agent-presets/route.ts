import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const isMissingTableError = (error: { code?: string | null; message?: string | null } | null | undefined) => {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST116';
};

export async function GET() {
  try {
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ presets: [] });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('agent_presets')
      .select('preset_id, prompt, updated_at')
      .order('preset_id', { ascending: true });

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ presets: [] });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      presets: (data || []).map((row) => ({
        presetId: row.preset_id,
        prompt: row.prompt,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 });
    }

    const body = await req.json();
    const presetId = typeof body?.presetId === 'string' ? body.presetId.trim() : '';
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';

    if (!presetId) {
      return NextResponse.json({ error: 'presetId is required' }, { status: 400 });
    }
    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('agent_presets')
      .upsert(
        {
          preset_id: presetId,
          prompt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'preset_id' },
      )
      .select('preset_id, prompt, updated_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      preset: {
        presetId: data.preset_id,
        prompt: data.prompt,
        updatedAt: data.updated_at,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 },
    );
  }
}
