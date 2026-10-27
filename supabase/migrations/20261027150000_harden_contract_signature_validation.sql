-- Tighten contract signature payloads at the database boundary as well as in the UI.
-- PNG data URLs are the only format emitted by the signature canvas.
ALTER TABLE public.sale_contract_signatures
  DROP CONSTRAINT IF EXISTS sale_contract_signatures_signature_image_data_check;

ALTER TABLE public.sale_contract_signatures
  ADD CONSTRAINT sale_contract_signatures_signature_image_data_check
  CHECK (
    length(signature_image_data) BETWEEN 30 AND 1500000
    AND signature_image_data ~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$'
  );

-- Ensure the finalization state is only accepted when both required signatures
-- are bound to the exact current contract hash. The existing trigger already
-- requires both roles; this additionally rejects stale/mismatched evidence.
CREATE OR REPLACE FUNCTION public.prevent_invalid_sale_contract_finalization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'assinado' AND OLD.status IS DISTINCT FROM 'assinado' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.sale_contract_signatures s
      WHERE s.contract_id = NEW.id
        AND s.signer_role = 'vendedor'
        AND s.document_sha256 = NEW.document_sha256
    ) OR NOT EXISTS (
      SELECT 1
      FROM public.sale_contract_signatures s
      WHERE s.contract_id = NEW.id
        AND s.signer_role = 'comprador'
        AND s.document_sha256 = NEW.document_sha256
    ) THEN
      RAISE EXCEPTION 'Seller and buyer signatures must match the current contract hash'
        USING ERRCODE = '42501';
    END IF;
    NEW.signed_at = COALESCE(NEW.signed_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_sale_contract_finalization ON public.sale_contracts;
CREATE TRIGGER validate_sale_contract_finalization
BEFORE UPDATE OF status ON public.sale_contracts
FOR EACH ROW
EXECUTE FUNCTION public.prevent_invalid_sale_contract_finalization();

-- Keep customer creator attribution stable for ordinary authenticated users.
CREATE OR REPLACE FUNCTION public.prevent_client_creator_spoofing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.criado_por IS DISTINCT FROM OLD.criado_por
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only administrators may change client creator attribution'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_client_creator_spoofing ON public.clientes;
CREATE TRIGGER prevent_client_creator_spoofing
BEFORE UPDATE OF criado_por ON public.clientes
FOR EACH ROW
EXECUTE FUNCTION public.prevent_client_creator_spoofing();
