-- Free plan for new signups (not yet paid)

ALTER TYPE public.subscription_plan RENAME TO subscription_plan_old;

CREATE TYPE public.subscription_plan AS ENUM ('free', 'garimpo', 'lojista', 'pro');

ALTER TABLE public.profiles
  ALTER COLUMN plan DROP DEFAULT,
  ALTER COLUMN plan TYPE public.subscription_plan
    USING plan::text::public.subscription_plan,
  ALTER COLUMN plan SET DEFAULT 'free';

DROP TYPE public.subscription_plan_old;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, plan)
  VALUES (NEW.id, NEW.email, 'free');
  RETURN NEW;
END;
$$;
