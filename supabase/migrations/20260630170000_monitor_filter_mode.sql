-- Replace boolean strict_match with filter_mode tiers (eBay/Dealerts-style).

ALTER TABLE public.monitors
  ADD COLUMN IF NOT EXISTS filter_mode text NOT NULL DEFAULT 'default'
    CHECK (filter_mode IN ('default', 'all_words', 'phrase', 'smart'));

UPDATE public.monitors
SET filter_mode = 'smart'
WHERE strict_match = true;

ALTER TABLE public.monitors
  DROP COLUMN IF EXISTS strict_match;
