-- Remove unused "rede" plan from enum (no profiles should use it)

UPDATE public.profiles SET plan = 'pro' WHERE plan::text = 'rede';

ALTER TYPE public.subscription_plan RENAME TO subscription_plan_old;

CREATE TYPE public.subscription_plan AS ENUM ('garimpo', 'lojista', 'pro');

ALTER TABLE public.profiles
  ALTER COLUMN plan DROP DEFAULT,
  ALTER COLUMN plan TYPE public.subscription_plan
    USING plan::text::public.subscription_plan,
  ALTER COLUMN plan SET DEFAULT 'garimpo';

DROP TYPE public.subscription_plan_old;
