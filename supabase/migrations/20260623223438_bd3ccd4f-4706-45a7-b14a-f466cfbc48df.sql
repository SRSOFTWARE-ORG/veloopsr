
DROP POLICY IF EXISTS "Can update checklist" ON public.checklist_entrega;
CREATE POLICY "Owners or admins update checklist"
ON public.checklist_entrega FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.vendas v
    WHERE v.id = checklist_entrega.venda_id AND v.vendedor_id = auth.uid()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.vendas v
    WHERE v.id = checklist_entrega.venda_id AND v.vendedor_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Authenticated users can read" ON storage.objects;
DROP POLICY IF EXISTS "Documents publicly accessible" ON storage.objects;

CREATE POLICY "Owners or admins read documentos_vendas"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documentos_vendas'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR owner = auth.uid()
  )
);
