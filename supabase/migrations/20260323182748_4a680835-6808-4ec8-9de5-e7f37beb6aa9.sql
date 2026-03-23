
-- Table for cash withdrawals (saídas de caixa)
CREATE TABLE public.saidas_caixa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valor numeric NOT NULL,
  motivo text NOT NULL,
  responsavel_id uuid NOT NULL,
  registrado_por uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.saidas_caixa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view saidas" ON public.saidas_caixa
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert saidas" ON public.saidas_caixa
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Only admins can delete saidas" ON public.saidas_caixa
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update saidas" ON public.saidas_caixa
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Add new permission columns
ALTER TABLE public.permissions
  ADD COLUMN pode_ver_faturamento boolean DEFAULT false,
  ADD COLUMN tipo_comissao text DEFAULT 'percentual',
  ADD COLUMN valor_comissao numeric DEFAULT 0;
