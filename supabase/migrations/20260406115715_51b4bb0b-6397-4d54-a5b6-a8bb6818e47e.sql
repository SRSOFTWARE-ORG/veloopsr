
-- Create sync triggers on ALL tables
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'clientes', 'vendas', 'venda_itens', 'cobrancas', 'cobranca_pagamentos',
    'produtos', 'comunicados', 'comunicado_destinatarios', 'whatsapp_blacklist',
    'documentos', 'dispositivos', 'assistencias', 'envio_cobranca',
    'saidas_caixa', 'estoque_movimentacao', 'pix_payments', 'profiles',
    'user_roles', 'permissions', 'notificacoes', 'audit_log',
    'conversations', 'messages', 'checklist_entrega', 'calendar_sync',
    'google_calendar_tokens', 'push_subscriptions'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trigger_sync_external_%I ON public.%I',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE TRIGGER trigger_sync_external_%I
       AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.notify_external_sync()',
      tbl, tbl
    );
  END LOOP;
END;
$$;
