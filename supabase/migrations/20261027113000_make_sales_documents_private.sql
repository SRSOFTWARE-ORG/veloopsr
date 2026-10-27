-- Sales documents can contain CPF, invoices and payment slips. A public
-- storage bucket bypasses object SELECT policies, so make it private and
-- migrate existing public URLs to object paths before the frontend switches
-- to short-lived signed URLs.
UPDATE public.documentos
SET url_arquivo = split_part(
  regexp_replace(url_arquivo, '^.*?/object/public/documentos_vendas/', ''),
  '?',
  1
)
WHERE url_arquivo LIKE '%/object/public/documentos_vendas/%';

UPDATE storage.buckets
SET public = false
WHERE id = 'documentos_vendas';

DROP POLICY IF EXISTS "Documents publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Owners or admins read documentos_vendas" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete files" ON storage.objects;
DROP POLICY IF EXISTS "Can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;

CREATE POLICY "Authenticated users upload sales documents"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documentos_vendas');

CREATE POLICY "Owners or admins delete sales documents"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'documentos_vendas'
  AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
);

CREATE POLICY "Authorized users read private sales documents"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'documentos_vendas'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR owner = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.documentos d
      LEFT JOIN public.vendas v ON v.id = d.venda_id
      WHERE d.url_arquivo = storage.objects.name
        AND (
          d.uploaded_by = auth.uid()
          OR v.vendedor_id = auth.uid()
        )
    )
  )
);
