-- Restrict customer-linked operational records to admins and the salesperson
-- responsible for the associated sale. RLS policies are permissive by default,
-- so drop the known broad SELECT policies before adding scoped replacements.

DROP POLICY IF EXISTS "Venda itens viewable" ON public.venda_itens;
CREATE POLICY "Admins and sale owners view sale items"
ON public.venda_itens
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.vendas v
    WHERE v.id = venda_itens.venda_id
      AND v.vendedor_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Dispositivos viewable" ON public.dispositivos;
CREATE POLICY "Admins and sale owners view devices"
ON public.dispositivos
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.vendas v
    WHERE v.id = dispositivos.venda_id
      AND v.vendedor_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Documentos viewable" ON public.documentos;
CREATE POLICY "Admins and sale owners view sale documents"
ON public.documentos
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    documentos.uploaded_by = auth.uid()
    AND documentos.venda_id IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM public.vendas v
    WHERE v.id = documentos.venda_id
      AND v.vendedor_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Checklist viewable" ON public.checklist_entrega;
CREATE POLICY "Admins and sale owners view delivery checklist"
ON public.checklist_entrega
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.vendas v
    WHERE v.id = checklist_entrega.venda_id
      AND v.vendedor_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Movimentacao viewable" ON public.estoque_movimentacao;
CREATE POLICY "Admins view inventory movements"
ON public.estoque_movimentacao
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
