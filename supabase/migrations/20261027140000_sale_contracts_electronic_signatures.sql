-- Sale contracts and electronic-signature audit trail.
-- The application must still be deployed and this migration applied before the feature is live.
CREATE TABLE IF NOT EXISTS public.sale_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE RESTRICT,
  vendedor_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','aguardando_assinaturas','assinado','cancelado')),
  template_version text NOT NULL DEFAULT 'sr-venda-celular-2026-01',
  contract_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  document_html text NOT NULL,
  document_sha256 text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  signed_at timestamptz,
  UNIQUE (id, venda_id)
);

CREATE INDEX IF NOT EXISTS sale_contracts_venda_id_idx ON public.sale_contracts(venda_id);
CREATE INDEX IF NOT EXISTS sale_contracts_vendedor_id_idx ON public.sale_contracts(vendedor_id);
ALTER TABLE public.sale_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sale owners and admins view contracts" ON public.sale_contracts;
CREATE POLICY "Sale owners and admins view contracts" ON public.sale_contracts
FOR SELECT TO authenticated USING (
  vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Sale owners and admins create contracts" ON public.sale_contracts;
CREATE POLICY "Sale owners and admins create contracts" ON public.sale_contracts
FOR INSERT TO authenticated WITH CHECK (
  created_by = auth.uid()
  AND (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  AND EXISTS (SELECT 1 FROM public.vendas v WHERE v.id = venda_id AND
    (v.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)))
);

DROP POLICY IF EXISTS "Sale owners and admins update unsigned contracts" ON public.sale_contracts;
CREATE POLICY "Sale owners and admins update unsigned contracts" ON public.sale_contracts
FOR UPDATE TO authenticated USING (
  (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  AND status IN ('rascunho','aguardando_assinaturas')
) WITH CHECK (
  (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  AND status IN ('rascunho','aguardando_assinaturas','assinado','cancelado')
);

CREATE TABLE IF NOT EXISTS public.sale_contract_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.sale_contracts(id) ON DELETE RESTRICT,
  signer_role text NOT NULL CHECK (signer_role IN ('vendedor','comprador','testemunha_1','testemunha_2')),
  signer_name text NOT NULL CHECK (length(trim(signer_name)) BETWEEN 2 AND 180),
  signer_document text,
  signature_image_data text NOT NULL CHECK (length(signature_image_data) <= 1500000),
  consent_text text NOT NULL,
  document_sha256 text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  signer_user_id uuid REFERENCES auth.users(id),
  user_agent text,
  UNIQUE (contract_id, signer_role)
);
CREATE INDEX IF NOT EXISTS sale_contract_signatures_contract_idx ON public.sale_contract_signatures(contract_id);
ALTER TABLE public.sale_contract_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sale owners and admins view signatures" ON public.sale_contract_signatures;
CREATE POLICY "Sale owners and admins view signatures" ON public.sale_contract_signatures
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.sale_contracts c WHERE c.id = contract_id
    AND (c.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)))
);

DROP POLICY IF EXISTS "Sale owners and admins sign contracts" ON public.sale_contract_signatures;
CREATE POLICY "Sale owners and admins sign contracts" ON public.sale_contract_signatures
FOR INSERT TO authenticated WITH CHECK (
  signer_user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.sale_contracts c WHERE c.id = contract_id
    AND c.status IN ('rascunho','aguardando_assinaturas')
    AND c.document_sha256 = document_sha256
    AND (c.vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)))
);

CREATE OR REPLACE FUNCTION public.prevent_signed_sale_contract_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'assinado' OR EXISTS (
      SELECT 1 FROM public.sale_contract_signatures s WHERE s.contract_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'Signed contracts and contracts with signature evidence cannot be deleted'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'assinado' OR EXISTS (
    SELECT 1 FROM public.sale_contract_signatures s WHERE s.contract_id = OLD.id
  ) THEN
    IF NEW.document_html IS DISTINCT FROM OLD.document_html
       OR NEW.document_sha256 IS DISTINCT FROM OLD.document_sha256
       OR NEW.contract_data IS DISTINCT FROM OLD.contract_data
       OR NEW.venda_id IS DISTINCT FROM OLD.venda_id
       OR NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id
       OR NEW.template_version IS DISTINCT FROM OLD.template_version THEN
      RAISE EXCEPTION 'Signed contract content is immutable'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_signed_sale_contract ON public.sale_contracts;
CREATE TRIGGER protect_signed_sale_contract
BEFORE UPDATE OR DELETE ON public.sale_contracts
FOR EACH ROW EXECUTE FUNCTION public.prevent_signed_sale_contract_mutation();

CREATE OR REPLACE FUNCTION public.prevent_sale_signature_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Electronic signature evidence is immutable'
    USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS protect_sale_signature_evidence ON public.sale_contract_signatures;
CREATE TRIGGER protect_sale_signature_evidence
BEFORE UPDATE OR DELETE ON public.sale_contract_signatures
FOR EACH ROW EXECUTE FUNCTION public.prevent_sale_signature_mutation();

REVOKE ALL ON TABLE public.sale_contracts FROM anon;
REVOKE ALL ON TABLE public.sale_contract_signatures FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sale_contracts TO authenticated;
GRANT SELECT, INSERT ON TABLE public.sale_contract_signatures TO authenticated;
