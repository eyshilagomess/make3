
-- 1. Dimensões e peso nos produtos (Melhor Envio)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS weight_g integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS length_cm numeric NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS width_cm numeric NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS height_cm numeric NOT NULL DEFAULT 10;

-- 2. Campos do pedido vindo da loja
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS guest_name text,
  ADD COLUMN IF NOT EXISTS guest_email text,
  ADD COLUMN IF NOT EXISTS guest_phone text,
  ADD COLUMN IF NOT EXISTS shipping_cep text,
  ADD COLUMN IF NOT EXISTS shipping_address jsonb,
  ADD COLUMN IF NOT EXISTS shipping_carrier text,
  ADD COLUMN IF NOT EXISTS shipping_service text,
  ADD COLUMN IF NOT EXISTS shipping_deadline_days integer,
  ADD COLUMN IF NOT EXISTS payment_link text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_source_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_source_check CHECK (source IN ('manual','site'));

-- 3. Leitura pública restrita (só produtos/variações ativos, colunas seguras)
DROP POLICY IF EXISTS "Anon read active products" ON public.products;
CREATE POLICY "Anon read active products"
ON public.products FOR SELECT TO anon
USING (status = 'ativo');

REVOKE SELECT ON public.products FROM anon;
GRANT SELECT (
  id, name, description, category, brand, photo_url,
  price_site, stock, has_variants,
  weight_g, length_cm, width_cm, height_cm,
  created_at, updated_at
) ON public.products TO anon;

DROP POLICY IF EXISTS "Anon read active variants" ON public.product_variants;
CREATE POLICY "Anon read active variants"
ON public.product_variants FOR SELECT TO anon
USING (status = 'ativo' AND EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_variants.product_id AND p.status = 'ativo'
));

REVOKE SELECT ON public.product_variants FROM anon;
GRANT SELECT (id, product_id, name, sku, stock, extra_price)
ON public.product_variants TO anon;

-- 4. Loja pode criar pedido (site) + itens, sempre pendentes
DROP POLICY IF EXISTS "Anon insert site orders" ON public.orders;
CREATE POLICY "Anon insert site orders"
ON public.orders FOR INSERT TO anon
WITH CHECK (
  source = 'site'
  AND channel = 'site'
  AND payment_status = 'pendente'
  AND status = 'pendente'
);
GRANT INSERT ON public.orders TO anon;

DROP POLICY IF EXISTS "Anon insert site order_items" ON public.order_items;
CREATE POLICY "Anon insert site order_items"
ON public.order_items FOR INSERT TO anon
WITH CHECK (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_items.order_id
    AND o.source = 'site'
    AND o.payment_status = 'pendente'
));
GRANT INSERT ON public.order_items TO anon;

-- 5. Configurações da loja (CEP origem, defaults etc.)
CREATE TABLE IF NOT EXISTS public.store_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team manage store settings" ON public.store_settings;
CREATE POLICY "Team manage store settings"
ON public.store_settings FOR ALL TO authenticated
USING (is_team_member(auth.uid()))
WITH CHECK (is_team_member(auth.uid()));

INSERT INTO public.store_settings (key, value)
VALUES
  ('shipping_origin_cep', to_jsonb('31110210'::text)),
  ('default_product_dims', jsonb_build_object('weight_g',200,'length_cm',20,'width_cm',15,'height_cm',10))
ON CONFLICT (key) DO NOTHING;
