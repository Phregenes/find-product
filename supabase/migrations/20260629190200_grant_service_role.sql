-- service_role needs explicit grants when auto-expose is disabled

GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.searches TO service_role;
GRANT ALL ON public.monitors TO service_role;
GRANT ALL ON public.search_results TO service_role;
GRANT ALL ON public.monitor_seen_products TO service_role;
