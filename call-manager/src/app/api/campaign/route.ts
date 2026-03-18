import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function POST(req: Request) {
    try {
        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Supabase configuration missing in environment variables.' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        const { phoneNumbers } = await req.json();

        if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
            return NextResponse.json({ error: 'An array of phone numbers is required' }, { status: 400 });
        }

        // Format data for bulk insert
        const callsToInsert = phoneNumbers.map((num: string) => ({
            phone_number: num.trim().startsWith('+') ? num.trim() : `+91${num.trim()}`, // Ensure proper formatting
            status: 'queued'
        }));

        const { data, error } = await supabase
            .from('calls')
            .insert(callsToInsert)
            .select();

        if (error) {
            console.error('Supabase Insert Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            queuedCount: data.length,
            calls: data
        });

    } catch (error: any) {
        console.error('Campaign Trigger Error:', error);
        return NextResponse.json({
            error: error.message || 'Internal Server Error',
        }, { status: 500 });
    }
}
