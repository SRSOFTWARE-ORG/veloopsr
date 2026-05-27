
-- clientes UPDATE
DROP POLICY IF EXISTS "Authenticated can update clientes" ON public.clientes;
CREATE POLICY "Owners or admins can update clientes"
ON public.clientes FOR UPDATE TO authenticated
USING ((criado_por = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK ((criado_por = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- cobrancas SELECT
DROP POLICY IF EXISTS "Authenticated can view cobrancas" ON public.cobrancas;
CREATE POLICY "Owners or admins view cobrancas"
ON public.cobrancas FOR SELECT TO authenticated
USING ((criado_por = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- cobranca_pagamentos SELECT/UPDATE scoped via cobrancas
DROP POLICY IF EXISTS "Authenticated can view cobranca_pagamentos" ON public.cobranca_pagamentos;
CREATE POLICY "Owners or admins view cobranca_pagamentos"
ON public.cobranca_pagamentos FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.cobrancas c
    WHERE c.id = cobranca_pagamentos.cobranca_id AND c.criado_por = auth.uid()
  )
);

DROP POLICY IF EXISTS "Authenticated can update cobranca_pagamentos" ON public.cobranca_pagamentos;
CREATE POLICY "Owners or admins update cobranca_pagamentos"
ON public.cobranca_pagamentos FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.cobrancas c
    WHERE c.id = cobranca_pagamentos.cobranca_id AND c.criado_por = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.cobrancas c
    WHERE c.id = cobranca_pagamentos.cobranca_id AND c.criado_por = auth.uid()
  )
);

-- pix_payments UPDATE admin-only (edge functions use service_role and bypass RLS)
DROP POLICY IF EXISTS "Authenticated can update pix_payments" ON public.pix_payments;
CREATE POLICY "Admins update pix_payments"
ON public.pix_payments FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- envio_cobranca: remove null cobranca_id bypass
DROP POLICY IF EXISTS "Owners or admin insert envio_cobranca" ON public.envio_cobranca;
CREATE POLICY "Owners or admin insert envio_cobranca"
ON public.envio_cobranca FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.cobrancas c
    WHERE c.id = envio_cobranca.cobranca_id AND c.criado_por = auth.uid()
  )
);

-- conversations admin-only (service_role bypasses RLS for edge functions)
DROP POLICY IF EXISTS "Service can manage conversations" ON public.conversations;
CREATE POLICY "Admins view conversations"
ON public.conversations FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- messages admin-only
DROP POLICY IF EXISTS "Authenticated can view messages" ON public.messages;
DROP POLICY IF EXISTS "System can insert messages" ON public.messages;
CREATE POLICY "Admins view messages"
ON public.messages FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- checklist_entrega scoped to venda owner/admin
DROP POLICY IF EXISTS "Checklist viewable" ON public.checklist_entrega;
CREATE POLICY "Owners or admins view checklist"
ON public.checklist_entrega FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.vendas v
    WHERE v.id = checklist_entrega.venda_id AND v.vendedor_id = auth.uid()
  )
);

-- documentos scoped
DROP POLICY IF EXISTS "Documentos viewable" ON public.documentos;
CREATE POLICY "Owners or admins view documentos"
ON public.documentos FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR uploaded_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.vendas v
    WHERE v.id = documentos.venda_id AND v.vendedor_id = auth.uid()
  )
);

-- saidas_caixa admin-only view
DROP POLICY IF EXISTS "Authenticated can view saidas" ON public.saidas_caixa;
CREATE POLICY "Admins view saidas"
ON public.saidas_caixa FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
