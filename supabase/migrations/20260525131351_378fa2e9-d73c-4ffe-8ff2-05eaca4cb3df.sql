
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_name_freeform text,
  ADD COLUMN IF NOT EXISTS payment_method_2 payment_method,
  ADD COLUMN IF NOT EXISTS payment_amount_1 numeric,
  ADD COLUMN IF NOT EXISTS payment_amount_2 numeric;

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Team read payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Team upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Team update payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Team delete payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Public read payment proofs" ON storage.objects;

CREATE POLICY "Public read payment proofs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'payment-proofs');

CREATE POLICY "Team upload payment proofs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs' AND public.is_team_member(auth.uid()));

CREATE POLICY "Team update payment proofs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'payment-proofs' AND public.is_team_member(auth.uid()));

CREATE POLICY "Team delete payment proofs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'payment-proofs' AND public.is_team_member(auth.uid()));
