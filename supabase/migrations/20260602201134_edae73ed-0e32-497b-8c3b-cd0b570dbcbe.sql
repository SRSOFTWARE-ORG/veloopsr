
-- 1) Novos campos em cobranca_pagamentos
ALTER TABLE public.cobranca_pagamentos
  ADD COLUMN IF NOT EXISTS valor_pago numeric,
  ADD COLUMN IF NOT EXISTS valor_original numeric,
  ADD COLUMN IF NOT EXISTS juros_aplicado numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_restante numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS destino_saldo text;

-- 2) Tabela cobranca_sub_parcelas
CREATE TABLE IF NOT EXISTS public.cobranca_sub_parcelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cobranca_id uuid NOT NULL,
  parent_pagamento_id uuid,
  parent_data_vencimento date,
  descricao text NOT NULL,
  valor numeric NOT NULL,
  data_vencimento date NOT NULL,
  status text NOT NULL DEFAULT 'a_pagar',
  pago_em timestamptz,
  pago_por uuid,
  valor_pago numeric,
  juros_aplicado numeric NOT NULL DEFAULT 0,
  rolado_para_data date,
  origem text NOT NULL DEFAULT 'parcial',
  criado_por uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cobranca_sub_parcelas TO authenticated;
GRANT ALL ON public.cobranca_sub_parcelas TO service_role;

ALTER TABLE public.cobranca_sub_parcelas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners or admins view sub_parcelas"
ON public.cobranca_sub_parcelas FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.cobrancas c WHERE c.id = cobranca_sub_parcelas.cobranca_id AND c.criado_por = auth.uid())
);

CREATE POLICY "Owners or admins insert sub_parcelas"
ON public.cobranca_sub_parcelas FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.cobrancas c WHERE c.id = cobranca_sub_parcelas.cobranca_id AND c.criado_por = auth.uid())
);

CREATE POLICY "Owners or admins update sub_parcelas"
ON public.cobranca_sub_parcelas FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.cobrancas c WHERE c.id = cobranca_sub_parcelas.cobranca_id AND c.criado_por = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.cobrancas c WHERE c.id = cobranca_sub_parcelas.cobranca_id AND c.criado_por = auth.uid())
);

CREATE POLICY "Only admins delete sub_parcelas"
ON public.cobranca_sub_parcelas FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_sub_parcelas_cobranca ON public.cobranca_sub_parcelas(cobranca_id);
CREATE INDEX IF NOT EXISTS idx_sub_parcelas_status_venc ON public.cobranca_sub_parcelas(status, data_vencimento);

CREATE TRIGGER trg_sub_parcelas_updated
BEFORE UPDATE ON public.cobranca_sub_parcelas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
