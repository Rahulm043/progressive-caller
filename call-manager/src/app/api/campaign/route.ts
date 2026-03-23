import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
    DEFAULT_AGENT_RUNTIME_CONFIG,
    resolveAgentRuntimeConfig,
    type AgentRuntimeConfig,
} from '@/lib/agent-presets';
import { CampaignCreateSchema } from './schema';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const isMissingColumnError = (error: { code?: string | null; message?: string | null } | null | undefined, columnName: string) => {
    if (!error) return false;
    if (error.code === '42703' || error.code === 'PGRST204') return true;
    return typeof error.message === 'string' && error.message.includes(columnName);
};

export async function POST(req: Request) {
    try {
        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Supabase configuration missing in environment variables.' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        const parsed = CampaignCreateSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.message }, { status: 400 });
        }

        const { phoneNumbers, agentConfig, presetId, startsAt, name } = parsed.data;
        const resolvedAgentConfig = resolveAgentRuntimeConfig(
            presetId || DEFAULT_AGENT_RUNTIME_CONFIG.presetId,
            agentConfig as Partial<AgentRuntimeConfig>,
        );
        const starts_at = startsAt ? new Date(startsAt).toISOString() : null;
        const normalizedNumbers = Array.from(
            new Set(
                phoneNumbers
                    .map((num: string) => num.trim())
                    .filter(Boolean)
                    .map((num: string) => (num.startsWith('+') ? num : `+91${num}`)),
            ),
        );

        if (normalizedNumbers.length === 0) {
            return NextResponse.json({ error: 'At least one valid phone number is required.' }, { status: 400 });
        }

        // Format data for bulk insert
        const { data: campaign, error: campErr } = await supabase
            .from('campaigns')
            .insert({
                name,
                preset_id: resolvedAgentConfig.presetId,
                agent_config_snapshot: resolvedAgentConfig,
                starts_at,
                status: starts_at ? 'scheduled' : 'running',
            })
            .select()
            .single();

        if (campErr || !campaign) {
            console.error('Supabase Insert Error (campaign):', campErr);
            return NextResponse.json({ error: campErr?.message || 'Failed to create campaign' }, { status: 500 });
        }

        const { data: tailSequence, error: seqErr } = await supabase
            .from('calls')
            .select('sequence')
            .order('sequence', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (seqErr) {
            return NextResponse.json({ error: seqErr.message }, { status: 500 });
        }

        const baseSequence = typeof tailSequence?.sequence === 'number' ? tailSequence.sequence : 0;

        const callsToInsert = normalizedNumbers.map((num: string, index: number) => ({
            phone_number: num,
            status: 'queued',
            preset_id: resolvedAgentConfig.presetId,
            agent_config: resolvedAgentConfig,
            agent_config_snapshot: resolvedAgentConfig,
            campaign_id: campaign.id,
            starts_at,
            sequence: baseSequence + index + 1,
        }));

        let insertResult = await supabase
            .from('calls')
            .insert(callsToInsert)
            .select();

        if (isMissingColumnError(insertResult.error, 'agent_config') || isMissingColumnError(insertResult.error, 'preset_id')) {
            console.warn('Supabase schema does not include preset_id/agent_config yet; retrying with the base queue payload.');
            insertResult = await supabase
                .from('calls')
                .insert(
                    callsToInsert.map(({ phone_number, status, campaign_id, starts_at, sequence }) => ({
                        phone_number,
                        status,
                        campaign_id,
                        starts_at,
                        sequence,
                    })),
                )
                .select();
        }

        const { data, error } = insertResult;

        if (error) {
            console.error('Supabase Insert Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            queuedCount: data.length,
            calls: data,
            campaign,
        });

    } catch (error: unknown) {
        console.error('Campaign Trigger Error:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Internal Server Error',
        }, { status: 500 });
    }
}
