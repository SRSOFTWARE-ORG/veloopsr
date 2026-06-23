
-- 1) Dedup de documentos por conteúdo
ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS hash_arquivo text;
CREATE UNIQUE INDEX IF NOT EXISTS documentos_hash_arquivo_uidx ON public.documentos(hash_arquivo) WHERE hash_arquivo IS NOT NULL;

-- 2) push_subscriptions: garantir unique por endpoint + colunas auxiliares
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS last_used_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_uidx ON public.push_subscriptions(endpoint);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
