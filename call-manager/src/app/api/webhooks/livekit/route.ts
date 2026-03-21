import { NextResponse } from 'next/server';
import { WebhookReceiver } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function POST(req: Request) {
    try {
        const body = await req.text();
        const header = req.headers.get('Authorization');

        if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
            return NextResponse.json({ error: 'LiveKit credentials missing' }, { status: 500 });
        }

        const receiver = new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

        // Use the verify function if available in the SDK version, 
        // otherwise just parse (some versions might require auth header check)
        const event = await receiver.receive(body, header || '');

        console.log('LiveKit Webhook Event:', event.event);

        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 });
        }
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Fallback or Status Synchronization
        if (event.event === 'room_finished') {
            const roomName = event.room?.name;
            if (roomName) {
                // Mark completed only if the agent has not already finalized the row.
                const { error } = await supabase
                    .from('calls')
                    .update({ status: 'completed' })
                    .eq('livekit_room_name', roomName)
                    .neq('status', 'completed'); // Only update if agent didn't already

                if (error) console.error('Webhook DB Error:', error);
            }
        }

        return NextResponse.json({ success: true });

    } catch (error: unknown) {
        console.error('Webhook Error:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}
