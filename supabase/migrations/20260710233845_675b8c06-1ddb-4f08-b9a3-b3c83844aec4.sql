
CREATE POLICY "team upload product images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.is_team_member(auth.uid()));
CREATE POLICY "team update product images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.is_team_member(auth.uid()))
  WITH CHECK (bucket_id = 'product-images' AND public.is_team_member(auth.uid()));
CREATE POLICY "team delete product images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.is_team_member(auth.uid()));
CREATE POLICY "team read product images" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-images' AND public.is_team_member(auth.uid()));
