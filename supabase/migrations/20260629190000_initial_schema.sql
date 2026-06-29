-- Multi-tenant schema for FindProduct
-- Shared searches + per-user monitors + scrape cache + seen products

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE public.product_condition AS ENUM ('all', 'new', 'used');
CREATE TYPE public.sort_by AS ENUM ('relevance', 'recent');

-- ─── Profiles (extends auth.users) ───────────────────────────────────────────

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Shared searches (deduplicated across all users) ───────────────────────────

CREATE TABLE public.searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  query_normalized text NOT NULL,
  sort_by public.sort_by NOT NULL DEFAULT 'recent',
  condition public.product_condition NOT NULL DEFAULT 'all',
  last_scraped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT searches_unique_key UNIQUE (query_normalized, sort_by, condition)
);

CREATE INDEX searches_last_scraped_at_idx ON public.searches (last_scraped_at);

-- ─── User monitors (links user → shared search) ────────────────────────────────

CREATE TABLE public.monitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  search_id uuid NOT NULL REFERENCES public.searches (id) ON DELETE CASCADE,
  query text NOT NULL,
  last_checked_at timestamptz,
  new_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monitors_user_search_unique UNIQUE (user_id, search_id)
);

CREATE INDEX monitors_user_id_idx ON public.monitors (user_id);
CREATE INDEX monitors_search_id_idx ON public.monitors (search_id);

-- ─── Scrape cache (shared per search + page) ─────────────────────────────────

CREATE TABLE public.search_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id uuid NOT NULL REFERENCES public.searches (id) ON DELETE CASCADE,
  page int NOT NULL DEFAULT 1 CHECK (page >= 1),
  products jsonb NOT NULL DEFAULT '[]'::jsonb,
  scraped_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT search_results_search_page_unique UNIQUE (search_id, page)
);

CREATE INDEX search_results_search_id_idx ON public.search_results (search_id);
CREATE INDEX search_results_scraped_at_idx ON public.search_results (scraped_at);

-- ─── Seen products per monitor ───────────────────────────────────────────────

CREATE TABLE public.monitor_seen_products (
  monitor_id uuid NOT NULL REFERENCES public.monitors (id) ON DELETE CASCADE,
  product_id text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (monitor_id, product_id)
);

CREATE INDEX monitor_seen_products_monitor_id_idx ON public.monitor_seen_products (monitor_id);

-- ─── Helpers ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER monitors_set_updated_at
  BEFORE UPDATE ON public.monitors
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ─── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitor_seen_products ENABLE ROW LEVEL SECURITY;

-- profiles: own row only
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- monitors: full CRUD on own rows
CREATE POLICY monitors_select_own ON public.monitors
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY monitors_insert_own ON public.monitors
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY monitors_update_own ON public.monitors
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY monitors_delete_own ON public.monitors
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- searches: read if user has a monitor for that search
CREATE POLICY searches_select_via_monitor ON public.searches
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.monitors m
      WHERE m.search_id = searches.id
        AND m.user_id = auth.uid()
    )
  );

-- search_results: read if user has a monitor for that search
CREATE POLICY search_results_select_via_monitor ON public.search_results
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.monitors m
      WHERE m.search_id = search_results.search_id
        AND m.user_id = auth.uid()
    )
  );

-- seen products: access only through own monitors
CREATE POLICY monitor_seen_select_own ON public.monitor_seen_products
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.monitors m
      WHERE m.id = monitor_seen_products.monitor_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY monitor_seen_insert_own ON public.monitor_seen_products
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.monitors m
      WHERE m.id = monitor_seen_products.monitor_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY monitor_seen_delete_own ON public.monitor_seen_products
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.monitors m
      WHERE m.id = monitor_seen_products.monitor_id
        AND m.user_id = auth.uid()
    )
  );

-- searches + search_results writes: service_role only (no policies for authenticated)

-- ─── Grants (auto-expose disabled) ───────────────────────────────────────────

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitors TO authenticated;
GRANT SELECT ON public.searches TO authenticated;
GRANT SELECT ON public.search_results TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.monitor_seen_products TO authenticated;
