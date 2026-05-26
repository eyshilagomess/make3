
-- 1) Make payment-proofs private and replace public read with team-only read
UPDATE storage.buckets SET public = false WHERE id = 'payment-proofs';

DROP POLICY IF EXISTS "Public read payment proofs" ON storage.objects;

CREATE POLICY "Team read payment proofs"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'payment-proofs' AND public.is_team_member(auth.uid()));

-- 2) Hard-block any non-admin INSERT into user_roles (defense-in-depth restrictive policy)
CREATE POLICY "Only admins insert roles"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
