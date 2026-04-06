
CREATE OR REPLACE FUNCTION public.notify_external_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'mode', 'webhook',
    'table', TG_TABLE_NAME,
    'event_type', TG_OP,
    'record', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    'old_record', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END
  );

  PERFORM net.http_post(
    url := 'https://vajadqjzwveuxzmcywvn.supabase.co/functions/v1/sync-to-external',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhamFkcWp6d3ZldXh6bWN5d3ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzUwMzMsImV4cCI6MjA4OTYxMTAzM30.4L0shcYV23kEhSnFYz_BBc-4fAj1w01AOOox3FxYIso"}'::jsonb,
    body := payload
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'clientes', 'vendas', 'venda_itens', 'cobrancas', 'cobranca_pagamentos',
    'produtos', 'comunicados', 'comunicado_destinatarios', 'whatsapp_blacklist',
    'documentos', 'dispositivos', 'assistencias', 'envio_cobranca',
    'saidas_caixa', 'estoque_movimentacao', 'pix_payments', 'profiles',
    'notificacoes', 'audit_log', 'checklist_entrega'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS sync_external_%I ON public.%I;
       CREATE TRIGGER sync_external_%I
       AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW
       EXECUTE FUNCTION public.notify_external_sync();',
      tbl, tbl, tbl, tbl
    );
  END LOOP;
END;
$$;
