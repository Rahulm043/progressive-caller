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

        const reconcileCampaignStatus = async (campaignId: string) => {
            const { data: callRows, error: callsErr } = await supabase
                .from('calls')
                .select('status')
                .eq('campaign_id', campaignId);

            if (callsErr) {
                console.error('Webhook campaign reconcile calls error:', callsErr);
                return;
            }

            const statuses = (callRows || []).map((row) => String(row.status || '').toLowerCase());
            const queued = statuses.filter((s) => s === 'queued').length;
            const active = statuses.filter((s) => ['dispatching', 'ringing', 'connected', 'in_progress'].includes(s)).length;
            const completed = statuses.filter((s) => s === 'completed').length;
            const total = statuses.length;

            let nextStatus = 'running';
            if (total > 0 && queued === 0 && active === 0) {
                nextStatus = completed > 0 ? 'completed' : 'failed';
            }

            const { error: campaignErr } = await supabase
                .from('campaigns')
                .update({ status: nextStatus })
                .eq('id', campaignId);

            if (campaignErr) {
                console.error('Webhook campaign reconcile update error:', campaignErr);
            }
        };

        // Fallback or status synchronization
        if (event.event === 'room_finished') {
            const roomName = event.room?.name;
            if (roomName) {
                const { data: roomCallRows, error: roomLookupError } = await supabase
                    .from('calls')
                    .select('id,campaign_id,status')
                    .eq('livekit_room_name', roomName)
                    .limit(1);

                if (roomLookupError) {
                    console.error('Webhook DB lookup error:', roomLookupError);
                }

                // Mark completed only for active call states.
                const { error } = await supabase
                    .from('calls')
                    .update({ status: 'completed' })
                    .eq('livekit_room_name', roomName)
                    .in('status', ['dispatching', 'ringing', 'connected', 'in_progress']);

                if (error) console.error('Webhook DB Error:', error);

                const campaignId = roomCallRows?.[0]?.campaign_id as string | undefined;
                if (campaignId) {
                    await reconcileCampaignStatus(campaignId);
                }
            }
        }

        return NextResponse.json({ success: true });

    } catch (error: unknown) {
        console.error('Webhook Error:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}
