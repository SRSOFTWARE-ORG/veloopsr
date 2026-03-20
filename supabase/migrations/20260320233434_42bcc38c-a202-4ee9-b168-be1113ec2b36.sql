
CREATE TABLE public.cobranca_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cobranca_id uuid NOT NULL REFERENCES public.cobrancas(id) ON DELETE CASCADE,
  data_vencimento date NOT NULL,
  status text NOT NULL DEFAULT 'a_pagar',
  pago_por uuid,
  pago_em timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(cobranca_id, data_vencimento)
);

ALTER TABLE public.cobranca_pagamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view cobranca_pagamentos"
ON public.cobranca_pagamentos FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated can insert cobranca_pagamentos"
ON public.cobranca_pagamentos FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated can update cobranca_pagamentos"
ON public.cobranca_pagamentos FOR UPDATE TO authenticated
USING (true);

CREATE POLICY "Only admins can delete cobranca_pagamentos"
ON public.cobranca_pagamentos FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
