CREATE TABLE IF NOT EXISTS public.agent_presets (
    preset_id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_presets_updated_at
    ON public.agent_presets(updated_at DESC);

ALTER TABLE public.agent_presets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'agent_presets'
          AND policyname = 'Allow all access to agent presets'
    ) THEN
        CREATE POLICY "Allow all access to agent presets" ON public.agent_presets
          FOR ALL
          USING (true)
          WITH CHECK (true);
    END IF;
END $$;
