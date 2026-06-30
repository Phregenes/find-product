-- Pending new listings per monitor (persist until user marks as seen or listing disappears).

CREATE TABLE public.monitor_new_products (
  monitor_id uuid NOT NULL REFERENCES public.monitors (id) ON DELETE CASCADE,
  product_id text NOT NULL,
  product jsonb NOT NULL,
  found_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (monitor_id, product_id)
);

CREATE INDEX monitor_new_products_monitor_id_idx ON public.monitor_new_products (monitor_id);

ALTER TABLE public.monitor_new_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY monitor_new_select_own ON public.monitor_new_products
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.monitors m
      WHERE m.id = monitor_new_products.monitor_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY monitor_new_delete_own ON public.monitor_new_products
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.monitors m
      WHERE m.id = monitor_new_products.monitor_id
        AND m.user_id = auth.uid()
    )
  );

GRANT SELECT, DELETE ON public.monitor_new_products TO authenticated;

GRANT ALL ON public.monitor_new_products TO service_role;
