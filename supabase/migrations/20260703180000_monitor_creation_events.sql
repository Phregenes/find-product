-- Log monitor creations per user/day (BRT) to cap delete-and-recreate abuse.

CREATE TABLE public.monitor_creation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  monitor_id uuid REFERENCES public.monitors (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  brt_day date NOT NULL
);

CREATE INDEX monitor_creation_events_user_brt_day_idx
  ON public.monitor_creation_events (user_id, brt_day);

ALTER TABLE public.monitor_creation_events ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.monitor_creation_events TO service_role;
