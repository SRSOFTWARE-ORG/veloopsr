
-- Table for WhatsApp broadcast campaigns
CREATE TABLE public.comunicados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  criado_por UUID NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  formato TEXT NOT NULL DEFAULT 'texto',
  media_url TEXT,
  agendado_para TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'rascunho',
  total_destinatarios INTEGER DEFAULT 0,
  total_enviados INTEGER DEFAULT 0,
  total_falhas INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table for individual message delivery log
CREATE TABLE public.comunicado_destinatarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  comunicado_id UUID NOT NULL REFERENCES public.comunicados(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id),
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  erro TEXT,
  enviado_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Blacklist for opt-out
CREATE TABLE public.whatsapp_blacklist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telefone TEXT NOT NULL UNIQUE,
  motivo TEXT DEFAULT 'opt-out',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS
ALTER TABLE public.comunicados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicado_destinatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_blacklist ENABLE ROW LEVEL SECURITY;

-- Comunicados policies
CREATE POLICY "Admins manage comunicados" ON public.comunicados FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Destinatarios policies
CREATE POLICY "Admins manage destinatarios" ON public.comunicado_destinatarios FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.comunicados c WHERE c.id = comunicado_id AND has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.comunicados c WHERE c.id = comunicado_id AND has_role(auth.uid(), 'admin'::app_role)));

-- Blacklist policies
CREATE POLICY "Admins manage blacklist" ON public.whatsapp_blacklist FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime for progress tracking
ALTER PUBLICATION supabase_realtime ADD TABLE public.comunicado_destinatarios;
