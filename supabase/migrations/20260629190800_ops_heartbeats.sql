-- Operational heartbeats for /status monitoring (public read).

CREATE TABLE public.ops_heartbeats (
  service text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('ok', 'degraded', 'error')),
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ops_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY ops_heartbeats_public_read ON public.ops_heartbeats
  FOR SELECT TO anon, authenticated
  USING (true);

GRANT SELECT ON public.ops_heartbeats TO anon, authenticated;
GRANT ALL ON public.ops_heartbeats TO service_role;
