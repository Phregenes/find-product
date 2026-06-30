-- Email alert preference (opt-out via profile update)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_alerts boolean NOT NULL DEFAULT true;
