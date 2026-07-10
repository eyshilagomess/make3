
CREATE TABLE public.coupons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage','fixed')),
  discount_value NUMERIC(12,2) NOT NULL CHECK (discount_value >= 0),
  min_order_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_discount NUMERIC(12,2),
  usage_limit INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  per_customer_limit INTEGER,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  applies_to TEXT NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all','categories','products')),
  category_slugs TEXT[] NOT NULL DEFAULT '{}',
  product_ids UUID[] NOT NULL DEFAULT '{}',
  channels TEXT[] NOT NULL DEFAULT ARRAY['site'],
  first_purchase_only BOOLEAN NOT NULL DEFAULT FALSE,
  stackable BOOLEAN NOT NULL DEFAULT FALSE,
  free_shipping BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX coupons_code_idx ON public.coupons (code);
CREATE INDEX coupons_active_idx ON public.coupons (active) WHERE active = TRUE;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view coupons" ON public.coupons
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Team can insert coupons" ON public.coupons
  FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "Team can update coupons" ON public.coupons
  FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Team can delete coupons" ON public.coupons
  FOR DELETE TO authenticated USING (public.is_team_member(auth.uid()));

CREATE TRIGGER coupons_updated_at BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Redemptions (auditoria de uso)
CREATE TABLE public.coupon_redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_email TEXT,
  customer_phone TEXT,
  discount_applied NUMERIC(12,2) NOT NULL DEFAULT 0,
  order_subtotal NUMERIC(12,2),
  channel TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX coupon_redemptions_coupon_idx ON public.coupon_redemptions (coupon_id);
CREATE INDEX coupon_redemptions_email_idx ON public.coupon_redemptions (customer_email);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view redemptions" ON public.coupon_redemptions
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Team can manage redemptions" ON public.coupon_redemptions
  FOR ALL TO authenticated USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));
