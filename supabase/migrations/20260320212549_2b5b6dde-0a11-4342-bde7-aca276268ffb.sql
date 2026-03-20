
CREATE TABLE public.cobrancas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE NOT NULL,
  cliente_nome TEXT NOT NULL,
  valor_parcela NUMERIC NOT NULL,
  frequencia TEXT NOT NULL DEFAULT 'mes',
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  criado_por UUID NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.cobrancas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view cobrancas" ON public.cobrancas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert cobrancas" ON public.cobrancas
  FOR INSERT TO authenticated WITH CHECK (criado_por = auth.uid());

CREATE POLICY "Authenticated can update cobrancas" ON public.cobrancas
  FOR UPDATE TO authenticated USING (
    criado_por = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Only admins can delete cobrancas" ON public.cobrancas
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
