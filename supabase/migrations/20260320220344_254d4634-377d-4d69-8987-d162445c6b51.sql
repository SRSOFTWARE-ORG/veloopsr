CREATE TABLE public.assistencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_nome text NOT NULL,
  cliente_telefone text,
  modelo text,
  imei_serial text,
  defeito text NOT NULL,
  observacoes text,
  status text NOT NULL DEFAULT 'aberto',
  vendedor_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.assistencias ENABLE ROW LEVEL SECURITY;

-- Vendedores see own, admins see all
CREATE POLICY "Vendedores see own assistencias"
ON public.assistencias FOR SELECT TO authenticated
USING (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can insert assistencias"
ON public.assistencias FOR INSERT TO authenticated
WITH CHECK (vendedor_id = auth.uid());

CREATE POLICY "Vendedores update own assistencias"
ON public.assistencias FOR UPDATE TO authenticated
USING (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins delete assistencias"
ON public.assistencias FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_assistencias_updated_at
  BEFORE UPDATE ON public.assistencias
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();