
-- 1. CLIENTES: restrict SELECT to owner/admin
DROP POLICY IF EXISTS "Clientes viewable by authenticated" ON public.clientes;
CREATE POLICY "Clientes viewable by owner or admin"
ON public.clientes FOR SELECT TO authenticated
USING (criado_por = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Drop duplicate delete policy
DROP POLICY IF EXISTS "Only admins can delete clients" ON public.clientes;

-- 2. PERMISSIONS: restrict SELECT to own row or admin
DROP POLICY IF EXISTS "Permissions viewable by authenticated" ON public.permissions;
CREATE POLICY "Users view own permissions or admin"
ON public.permissions FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 3. PIX_PAYMENTS: remove anon write access (service role bypasses RLS for edge functions)
DROP POLICY IF EXISTS "Service can insert pix_payments" ON public.pix_payments;
DROP POLICY IF EXISTS "Service can update pix_payments" ON public.pix_payments;
CREATE POLICY "Authenticated can insert pix_payments"
ON public.pix_payments FOR INSERT TO authenticated
WITH CHECK (true);
CREATE POLICY "Authenticated can update pix_payments"
ON public.pix_payments FOR UPDATE TO authenticated
USING (true);
-- Keep public SELECT (needed for public PIX payment page)

-- 4. SCAN_LOGS: only authenticated can insert
DROP POLICY IF EXISTS "System insert scan_logs" ON public.scan_logs;
CREATE POLICY "Authenticated can insert scan_logs"
ON public.scan_logs FOR INSERT TO authenticated
WITH CHECK (true);

-- 5. ENVIO_COBRANCA: tighten insert
DROP POLICY IF EXISTS "System can insert envio_cobranca" ON public.envio_cobranca;
CREATE POLICY "Owners or admin insert envio_cobranca"
ON public.envio_cobranca FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR cobranca_id IS NULL
  OR EXISTS (SELECT 1 FROM public.cobrancas c WHERE c.id = envio_cobranca.cobranca_id AND c.criado_por = auth.uid())
);

-- 6. STORAGE: documentos_vendas delete requires admin role
DROP POLICY IF EXISTS "Admins can delete files" ON storage.objects;
CREATE POLICY "Admins delete documentos_vendas"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documentos_vendas' AND public.has_role(auth.uid(), 'admin'));

-- 7. Revoke EXECUTE on SECURITY DEFINER functions from anon
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_external_sync() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
