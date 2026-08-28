-- Allow OLX + Enjoei combo for Garimpo/Lojista plans
ALTER TABLE public.monitors DROP CONSTRAINT IF EXISTS monitors_marketplace_mode_check;

ALTER TABLE public.monitors
  ADD CONSTRAINT monitors_marketplace_mode_check
  CHECK (marketplace_mode IN ('ml', 'olx', 'enjoei', 'both', 'olx_enjoei'));
