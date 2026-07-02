-- Per-monitor email alert preference (in addition to profile + plan gates).

ALTER TABLE public.monitors
  ADD COLUMN IF NOT EXISTS email_alerts boolean NOT NULL DEFAULT true;
