-- Fingerprint of item IDs included in the last email alert (per monitor).

ALTER TABLE public.monitors
  ADD COLUMN IF NOT EXISTS last_notified_item_ids text[] NOT NULL DEFAULT '{}';
