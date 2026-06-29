-- Subscription plans on user profiles

CREATE TYPE public.subscription_plan AS ENUM ('garimpo', 'lojista', 'pro');

ALTER TABLE public.profiles
  ADD COLUMN plan public.subscription_plan NOT NULL DEFAULT 'garimpo';
