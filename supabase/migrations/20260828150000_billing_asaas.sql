-- Billing fields for Asaas subscriptions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS asaas_customer_id text,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text,
  ADD COLUMN IF NOT EXISTS asaas_subscription_status text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_asaas_subscription_id_idx
  ON public.profiles (asaas_subscription_id)
  WHERE asaas_subscription_id IS NOT NULL;
