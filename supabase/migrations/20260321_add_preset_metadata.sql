-- Add preset metadata to calls so the dashboard can persist the effective agent stack.
-- Safe to run multiple times.

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS preset_id TEXT,
  ADD COLUMN IF NOT EXISTS agent_config JSONB;
