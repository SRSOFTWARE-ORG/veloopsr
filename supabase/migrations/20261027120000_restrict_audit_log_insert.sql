-- Prevent authenticated users from writing audit entries attributed to other users.
-- Trusted Edge Functions use service_role and bypass RLS.
DROP POLICY IF EXISTS "Can insert audit" ON public.audit_log;
CREATE POLICY "Users insert own audit entries"
ON public.audit_log
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);
