-- New monitors opt in to email alerts (default off).

ALTER TABLE public.monitors
  ALTER COLUMN email_alerts SET DEFAULT false;
