ALTER TABLE public.cobrancas ADD COLUMN IF NOT EXISTS venda_id uuid;
CREATE INDEX IF NOT EXISTS idx_cobrancas_venda_id ON public.cobrancas(venda_id);