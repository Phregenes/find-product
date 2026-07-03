-- Per-scrape proxy bandwidth (IPRoyal / residential) for cost tracking.

CREATE TABLE public.proxy_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('cron', 'initial', 'search')),
  marketplace text CHECK (marketplace IN ('ml', 'olx')),
  query text,
  bytes_downloaded bigint NOT NULL DEFAULT 0,
  bytes_uploaded bigint NOT NULL DEFAULT 0,
  request_count int NOT NULL DEFAULT 0,
  duration_ms int,
  lean_bandwidth boolean NOT NULL DEFAULT false,
  max_pages int
);

CREATE INDEX proxy_usage_events_created_at_idx ON public.proxy_usage_events (created_at DESC);
CREATE INDEX proxy_usage_events_source_idx ON public.proxy_usage_events (source, created_at DESC);

ALTER TABLE public.proxy_usage_events ENABLE ROW LEVEL SECURITY;

-- Public read for status dashboard (aggregates only exposed via API).
CREATE POLICY proxy_usage_events_public_read ON public.proxy_usage_events
  FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.proxy_usage_events TO anon, authenticated;
GRANT ALL ON public.proxy_usage_events TO service_role;
