-- Client records contain contact details and CPF. Replace legacy policies
-- that exposed all clients and allowed arbitrary creator attribution.
DROP POLICY IF EXISTS "Clientes viewable by authenticated" ON public.clientes;
CREATE POLICY "Owners or admins view clientes"
ON public.clientes
FOR SELECT TO authenticated
USING (
  criado_por = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Authenticated can insert clientes" ON public.clientes;
CREATE POLICY "Users insert own clientes"
ON public.clientes
FOR INSERT TO authenticated
WITH CHECK (
  criado_por = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);
