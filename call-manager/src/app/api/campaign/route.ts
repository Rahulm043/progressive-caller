import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
    DEFAULT_AGENT_RUNTIME_CONFIG,
    resolveAgentRuntimeConfig,
    type AgentRuntimeConfig,
} from '@/lib/agent-presets';

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

        const body = await req.json();
        const phoneNumbers = body?.phoneNumbers;
        const agentConfig = body?.agentConfig as Partial<AgentRuntimeConfig> | undefined;
        const resolvedAgentConfig = resolveAgentRuntimeConfig(
            agentConfig?.presetId || DEFAULT_AGENT_RUNTIME_CONFIG.presetId,
            agentConfig,
        );

        if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
            return NextResponse.json({ error: 'An array of phone numbers is required' }, { status: 400 });
        }

        // Format data for bulk insert
        const callsToInsert = phoneNumbers.map((num: string) => ({
            phone_number: num.trim().startsWith('+') ? num.trim() : `+91${num.trim()}`, // Ensure proper formatting
            status: 'queued',
            preset_id: resolvedAgentConfig.presetId,
            agent_config: resolvedAgentConfig,
        }));

        let insertResult = await supabase
            .from('calls')
            .insert(callsToInsert)
            .select();

        if (isMissingColumnError(insertResult.error, 'agent_config') || isMissingColumnError(insertResult.error, 'preset_id')) {
            console.warn('Supabase schema does not include preset_id/agent_config yet; retrying with the base queue payload.');
            insertResult = await supabase
                .from('calls')
                .insert(callsToInsert.map(({ phone_number, status }) => ({ phone_number, status })))
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
            calls: data
        });

    } catch (error: unknown) {
        console.error('Campaign Trigger Error:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Internal Server Error',
        }, { status: 500 });
    }
}
