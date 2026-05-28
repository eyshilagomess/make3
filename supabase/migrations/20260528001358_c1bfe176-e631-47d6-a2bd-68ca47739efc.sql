
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS photo_url text;

INSERT INTO storage.buckets (id, name, public) VALUES ('expense-receipts', 'expense-receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Team read expense receipts" ON storage.objects;
DROP POLICY IF EXISTS "Team upload expense receipts" ON storage.objects;
DROP POLICY IF EXISTS "Team delete expense receipts" ON storage.objects;

CREATE POLICY "Team read expense receipts" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'expense-receipts' AND public.is_team_member(auth.uid()));

CREATE POLICY "Team upload expense receipts" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'expense-receipts' AND public.is_team_member(auth.uid()));

CREATE POLICY "Team delete expense receipts" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'expense-receipts' AND public.is_team_member(auth.uid()));
