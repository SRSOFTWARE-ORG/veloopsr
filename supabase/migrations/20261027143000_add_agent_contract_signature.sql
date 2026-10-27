-- Add the commercial agent as an optional contract signer.
-- Seller + buyer remain the only required signatures for finalization.
ALTER TABLE public.sale_contract_signatures
  DROP CONSTRAINT IF EXISTS sale_contract_signatures_signer_role_check;

ALTER TABLE public.sale_contract_signatures
  ADD CONSTRAINT sale_contract_signatures_signer_role_check
  CHECK (signer_role IN ('vendedor','comprador','agente','testemunha_1','testemunha_2'));
