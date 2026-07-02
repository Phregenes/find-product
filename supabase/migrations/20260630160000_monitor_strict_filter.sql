-- Per-monitor strict title matching (filters accessories / loose ML results).

ALTER TABLE public.monitors
  ADD COLUMN IF NOT EXISTS strict_match boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exclude_terms text[] NOT NULL DEFAULT '{}';
