-- Enjoei marketplace: searches.marketplace + monitor FK + mode.

ALTER TABLE public.searches DROP CONSTRAINT IF EXISTS searches_marketplace_check;
ALTER TABLE public.searches
  ADD CONSTRAINT searches_marketplace_check
  CHECK (marketplace IN ('ml', 'olx', 'enjoei'));

ALTER TABLE public.monitors DROP CONSTRAINT IF EXISTS monitors_marketplace_mode_check;
ALTER TABLE public.monitors
  ADD CONSTRAINT monitors_marketplace_mode_check
  CHECK (marketplace_mode IN ('ml', 'olx', 'enjoei', 'both'));

ALTER TABLE public.monitors
  ADD COLUMN IF NOT EXISTS enjoei_search_id uuid REFERENCES public.searches (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS monitors_enjoei_search_id_idx ON public.monitors (enjoei_search_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'proxy_usage_events'
      AND column_name = 'marketplace'
  ) THEN
    ALTER TABLE public.proxy_usage_events DROP CONSTRAINT IF EXISTS proxy_usage_events_marketplace_check;
    ALTER TABLE public.proxy_usage_events
      ADD CONSTRAINT proxy_usage_events_marketplace_check
      CHECK (marketplace IS NULL OR marketplace IN ('ml', 'olx', 'enjoei'));
  END IF;
END $$;
