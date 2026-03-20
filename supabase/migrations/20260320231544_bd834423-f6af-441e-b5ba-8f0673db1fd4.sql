CREATE POLICY "Authenticated can update documentos"
ON public.documentos
FOR UPDATE
TO authenticated
USING (true);