-- Tabela para rastrear reenvios automáticos e manuais de mensagens falhas
CREATE TABLE IF NOT EXISTS public.whatsapp_resend_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envio_id UUID REFERENCES public.envio_cobranca(id),
    status TEXT NOT NULL, -- 'sucesso', 'falha'
    tentativa INTEGER DEFAULT 1,
    erro TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.whatsapp_resend_logs ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ver os logs de reenvio
CREATE POLICY "Admins can view resend logs" ON public.whatsapp_resend_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- Atualizar RLS da tabela clientes para garantir segurança no backend
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON public.clientes;
CREATE POLICY "Only admins can delete clients" ON public.clientes
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- Índice para performance na busca de pendentes
CREATE INDEX IF NOT EXISTS idx_envio_cobranca_falha ON public.envio_cobranca (enviado_com_sucesso, criado_em);
