
-- 1) PIX: drop public SELECT and expose only a safe RPC for status polling
DROP POLICY IF EXISTS "Public can view pix_payments" ON public.pix_payments;

-- Owners/admins can still read full rows for the dashboard
CREATE POLICY "Admins view pix_payments"
ON public.pix_payments FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Safe status-only RPC for the public payment page (no QR/copia-cola leakage)
CREATE OR REPLACE FUNCTION public.get_pix_payment_status(
  _cobranca_id uuid,
  _data_vencimento date
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status
  FROM public.pix_payments
  WHERE cobranca_id = _cobranca_id
    AND data_vencimento = _data_vencimento
  ORDER BY created_at DESC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_pix_payment_status(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pix_payment_status(uuid, date) TO anon, authenticated, service_role;

-- 2) Storage: documentos_vendas — drop public-role read policy, keep auth-only direct API read
DROP POLICY IF EXISTS "Documents publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Can upload documents" ON storage.objects;
-- "Authenticated users can read", "Authenticated users can upload",
-- "Admins delete documentos_vendas" and "Only admins delete docs" remain in place.

-- 3) Harden authorization helper functions: revoke from public/anon
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.notify_external_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_external_sync() TO service_role;

-- 4) Fix whatsapp_resend_logs SELECT policy: was role=public, scope to authenticated
DROP POLICY IF EXISTS "Admins can view resend logs" ON public.whatsapp_resend_logs;
CREATE POLICY "Admins can view resend logs"
ON public.whatsapp_resend_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
