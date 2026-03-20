ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS preco_credito numeric,
  ADD COLUMN IF NOT EXISTS preco_boleto numeric,
  ADD COLUMN IF NOT EXISTS preco_pix numeric,
  ADD COLUMN IF NOT EXISTS preco_carne numeric;