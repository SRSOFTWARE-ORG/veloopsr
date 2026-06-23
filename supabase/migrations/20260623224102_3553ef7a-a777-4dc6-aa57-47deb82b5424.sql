DROP POLICY IF EXISTS "Authenticated can update product images" ON storage.objects;
CREATE POLICY "Admins update produto_imagens"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'produto_imagens' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'produto_imagens' AND public.has_role(auth.uid(), 'admin'));