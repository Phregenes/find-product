-- OLX marketplace support: shared searches per marketplace + monitor source mode.

ALTER TABLE public.searches
  ADD COLUMN IF NOT EXISTS marketplace text NOT NULL DEFAULT 'ml'
    CHECK (marketplace IN ('ml', 'olx'));

ALTER TABLE public.searches
  DROP CONSTRAINT IF EXISTS searches_unique_key;

ALTER TABLE public.searches
  ADD CONSTRAINT searches_unique_key
    UNIQUE (query_normalized, sort_by, condition, marketplace);

ALTER TABLE public.monitors
  ADD COLUMN IF NOT EXISTS marketplace_mode text NOT NULL DEFAULT 'ml'
    CHECK (marketplace_mode IN ('ml', 'olx', 'both'));

ALTER TABLE public.monitors
  ADD COLUMN IF NOT EXISTS olx_search_id uuid REFERENCES public.searches (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS monitors_olx_search_id_idx ON public.monitors (olx_search_id);
