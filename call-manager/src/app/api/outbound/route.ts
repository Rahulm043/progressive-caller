import { NextResponse } from 'next/server';
import { AgentDispatchClient } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';
import {
    DEFAULT_AGENT_RUNTIME_CONFIG,
    resolveAgentRuntimeConfig,
    type AgentRuntimeConfig,
} from '@/lib/agent-presets';

const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const isMissingColumnError = (error: { code?: string | null; message?: string | null } | null | undefined, columnName: string) => {
    if (!error) return false;
    if (error.code === '42703' || error.code === 'PGRST204') return true;
    return typeof error.message === 'string' && error.message.includes(columnName);
};

type Mode = 'now' | 'queue';

export async function POST(req: Request) {
    let insertedCallId: string | null = null;
    try {
        const body = await req.json();
        const rawPhoneNumber = body?.phoneNumber;
        const agentConfig = body?.agentConfig as Partial<AgentRuntimeConfig> | undefined;
        const mode: Mode = body?.mode === 'now' ? 'now' : 'queue';

        if (!rawPhoneNumber) {
            return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
        }

        if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
            return NextResponse.json({ error: 'LiveKit configuration missing' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const phoneNumber = rawPhoneNumber.trim().startsWith('+') ? rawPhoneNumber.trim() : `+91${rawPhoneNumber.trim()}`;
        const resolvedAgentConfig = resolveAgentRuntimeConfig(
            agentConfig?.presetId || DEFAULT_AGENT_RUNTIME_CONFIG.presetId,
            agentConfig,
        );

        // Determine sequence: "now" should go to the front of the queue
        let sequenceOverride: number | undefined;
        if (mode === 'now') {
            const { data: head, error: headErr } = await supabase
                .from('calls')
                .select('sequence')
                .eq('status', 'queued')
                .order('sequence', { ascending: true })
                .limit(1)
                .single();
            if (headErr && headErr.code && !['PGRST116', 'PGRST204'].includes(headErr.code)) {
                console.warn('Failed to fetch head sequence for call-now:', headErr);
            }
            const headSeq = head?.sequence ?? 0;
            sequenceOverride = headSeq - 1;
        }

        const callInsertPayload = {
            phone_number: phoneNumber,
            status: mode === 'now' ? 'dispatching' : 'queued',
            preset_id: resolvedAgentConfig.presetId,
            agent_config: resolvedAgentConfig,
            agent_config_snapshot: resolvedAgentConfig,
            sequence: sequenceOverride,
        };

        // 1. Create a record in Supabase first
        let insertResult = await supabase
            .from('calls')
            .insert(callInsertPayload)
            .select()
            .single();

        if (isMissingColumnError(insertResult.error, 'agent_config') || isMissingColumnError(insertResult.error, 'preset_id')) {
            console.warn('Supabase schema does not include preset_id/agent_config yet; retrying with the base call payload.');
            insertResult = await supabase
                .from('calls')
                .insert({
                    phone_number: phoneNumber,
                    status: mode === 'now' ? 'dispatching' : 'queued',
                })
                .select()
                .single();
        }

        const { data: callRecord, error: dbError } = insertResult;

        if (dbError) {
            console.error('Supabase Insert Error:', dbError);
            return NextResponse.json({ error: 'Failed to register call in database' }, { status: 500 });
        }

        insertedCallId = callRecord.id;

        // Queue-only mode: defer dispatch to the campaign runner backend.
        if (mode === 'queue') {
            return NextResponse.json({
                success: true,
                queued: true,
                callId: callRecord.id,
                message: 'Call added to queue. It will be picked by the campaign runner.',
            });
        }

        const roomName = `call-${phoneNumber.replace('+', '')}-${Math.floor(Math.random() * 10000)}`;
        const { error: preDispatchUpdateError } = await supabase
            .from('calls')
            .update({ livekit_room_name: roomName, status: 'dispatching' })
            .eq('id', callRecord.id);

        if (preDispatchUpdateError) {
            console.error('Failed to store room before dispatch:', preDispatchUpdateError);
            return NextResponse.json({ error: 'Failed to prepare call dispatch.' }, { status: 500 });
        }

        // 2. Dispatch Agent with call_id in metadata
        const dispatchClient = new AgentDispatchClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

        console.log(`Dispatching Agent: Agent=outbound-caller, To=${phoneNumber}, Room=${roomName}, CallID=${callRecord.id}`);

        const dispatch = await dispatchClient.createDispatch(
            roomName,
            'outbound-caller',
            {
                metadata: JSON.stringify({
                    phone_number: phoneNumber,
                    call_id: callRecord.id,
                    preset_id: resolvedAgentConfig.presetId,
                    language: resolvedAgentConfig.language,
                    prompt: resolvedAgentConfig.prompt,
                    greeting_instruction: resolvedAgentConfig.greetingInstruction,
                    recipient_profile: resolvedAgentConfig.recipientProfile,
                    agent_config: resolvedAgentConfig,
                })
            }
        );

        console.log('Agent Dispatched Successfully:', dispatch.id);

        const { error: dispatchUpdateError } = await supabase
            .from('calls')
            .update({ dispatch_id: dispatch.id, status: 'in_progress' })
            .eq('id', callRecord.id);

        if (dispatchUpdateError) {
            console.error('Failed to store dispatch_id:', dispatchUpdateError);
        }

        return NextResponse.json({
            success: true,
            queued: false,
            roomName,
            callId: callRecord.id,
            participantId: dispatch.id
        });

    } catch (error: unknown) {
        console.error('Call Trigger Error:', error);
        if (insertedCallId && supabaseUrl && supabaseKey) {
            try {
                const supabase = createClient(supabaseUrl, supabaseKey);
                await supabase
                    .from('calls')
                    .update({ status: 'failed' })
                    .eq('id', insertedCallId);
            } catch (updateError) {
                console.error('Failed to mark failed call after dispatch error:', updateError);
            }
        }
        // Return the specific error message from LiveKit for better debugging
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Internal Server Error',
            details: error instanceof Error ? error.toString() : String(error)
        }, { status: 500 });
    }
}
