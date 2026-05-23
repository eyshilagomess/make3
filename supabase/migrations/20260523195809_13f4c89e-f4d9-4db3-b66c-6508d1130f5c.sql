
-- Add has_variants flag to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS has_variants boolean NOT NULL DEFAULT false;

-- product_variants table
CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  barcode text,
  stock integer NOT NULL DEFAULT 0,
  min_stock integer NOT NULL DEFAULT 0,
  extra_cost numeric NOT NULL DEFAULT 0,
  extra_price numeric NOT NULL DEFAULT 0,
  status public.product_status NOT NULL DEFAULT 'ativo',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team read product_variants" ON public.product_variants
  FOR SELECT TO authenticated USING (is_team_member(auth.uid()));
CREATE POLICY "Team write product_variants" ON public.product_variants
  FOR INSERT TO authenticated WITH CHECK (is_team_member(auth.uid()));
CREATE POLICY "Team update product_variants" ON public.product_variants
  FOR UPDATE TO authenticated USING (is_team_member(auth.uid()));
CREATE POLICY "Admin/gerente delete product_variants" ON public.product_variants
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));

CREATE TRIGGER product_variants_set_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- stock_movements: add variant_id
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL;

-- order_items: add variant_id + variant_name snapshot
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS variant_name text;
