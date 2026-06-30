-- Per-monitor frozen snapshot so each plan tier sees data at its own refresh rate.

ALTER TABLE public.monitors
  ADD COLUMN IF NOT EXISTS snapshot_products jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_at timestamptz;
