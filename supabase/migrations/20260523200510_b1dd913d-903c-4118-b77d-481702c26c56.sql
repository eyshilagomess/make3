
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS packaging_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_costs numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_margin numeric NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS price_site numeric,
  ADD COLUMN IF NOT EXISTS price_shopee numeric,
  ADD COLUMN IF NOT EXISTS price_tiktok numeric;
