import { NextResponse } from 'next/server';
import { AgentDispatchClient } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';

const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function POST(req: Request) {
    try {
        const { phoneNumber } = await req.json();

        if (!phoneNumber) {
            return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
        }

        if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
            return NextResponse.json({ error: 'LiveKit configuration missing' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const roomName = `call-${phoneNumber.replace('+', '')}-${Math.floor(Math.random() * 10000)}`;

        // 1. Create a record in Supabase first
        const { data: callRecord, error: dbError } = await supabase
            .from('calls')
            .insert({
                phone_number: phoneNumber,
                status: 'dispatching',
                livekit_room_name: roomName
            })
            .select()
            .single();

        if (dbError) {
            console.error('Supabase Insert Error:', dbError);
            return NextResponse.json({ error: 'Failed to register call in database' }, { status: 500 });
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
                    call_id: callRecord.id
                })
            }
        );

        console.log('Agent Dispatched Successfully:', dispatch.id);

        return NextResponse.json({
            success: true,
            roomName,
            callId: callRecord.id,
            participantId: dispatch.id
        });

    } catch (error: any) {
        console.error('Call Trigger Error:', error);
        // Return the specific error message from LiveKit for better debugging
        return NextResponse.json({
            error: error.message || 'Internal Server Error',
            details: error.toString()
        }, { status: 500 });
    }
}
