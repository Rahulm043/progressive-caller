-- Phase A: foundational schema for campaigns and ordered call attempts
-- Idempotent guards included for safe re-runs.

-- Extend existing calls table to behave as call_attempts during transition.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calls' AND column_name = 'sequence'
    ) THEN
        ALTER TABLE public.calls
            ADD COLUMN sequence BIGINT GENERATED ALWAYS AS IDENTITY;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calls' AND column_name = 'campaign_id'
    ) THEN
        ALTER TABLE public.calls
            ADD COLUMN campaign_id UUID NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calls' AND column_name = 'starts_at'
    ) THEN
        ALTER TABLE public.calls
            ADD COLUMN starts_at TIMESTAMPTZ NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calls' AND column_name = 'agent_config_snapshot'
    ) THEN
        ALTER TABLE public.calls
            ADD COLUMN agent_config_snapshot JSONB;
    END IF;
END $$;

-- Index to support ordered claiming and campaign filtering.
CREATE INDEX IF NOT EXISTS idx_calls_status_sequence ON public.calls(status, sequence);
CREATE INDEX IF NOT EXISTS idx_calls_campaign_status ON public.calls(campaign_id, status);

-- Campaigns table: stores the intent and agent snapshot for a batch of calls.
CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    preset_id TEXT NOT NULL,
    agent_config_snapshot JSONB NOT NULL,
    starts_at TIMESTAMPTZ NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status_starts_at ON public.campaigns(status, starts_at);

-- Basic open policy for MVP parity (tighten later).
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'campaigns'
          AND policyname = 'Allow all access to campaigns'
    ) THEN
        CREATE POLICY "Allow all access to campaigns" ON public.campaigns
          FOR ALL
          USING (true)
          WITH CHECK (true);
    END IF;
END $$;
