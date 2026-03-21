-- SQL to create the `calls` table in Supabase

CREATE TABLE public.calls (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    phone_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued', -- 'queued', 'in_progress', 'completed', 'failed'
    livekit_room_name TEXT,
    dispatch_id TEXT,
    preset_id TEXT,
    agent_config JSONB,
    duration_seconds INTEGER,
    transcript JSONB,
    recording_url TEXT
);

-- Optional: Add indexes for faster querying
CREATE INDEX idx_calls_status ON public.calls(status);
CREATE INDEX idx_calls_created_at ON public.calls(created_at DESC);

-- Enable Row Level Security (RLS) if you plan on restricting access by user
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- Simple policy to allow all authenticated and anon access for this MVP
-- (In production, restrict this based on authenticated users)
CREATE POLICY "Allow all access to calls" ON public.calls
  FOR ALL
  USING (true)
  WITH CHECK (true);
