CREATE TABLE public.pix_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cobranca_id UUID REFERENCES public.cobrancas(id),
  data_vencimento DATE NOT NULL,
  cliente_id UUID REFERENCES public.clientes(id),
  valor NUMERIC NOT NULL,
  mp_payment_id TEXT,
  mp_qr_code TEXT,
  mp_qr_code_base64 TEXT,
  mp_copia_cola TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pix_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view pix_payments" ON public.pix_payments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Service can insert pix_payments" ON public.pix_payments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Service can update pix_payments" ON public.pix_payments FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Admins can delete pix_payments" ON public.pix_payments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));