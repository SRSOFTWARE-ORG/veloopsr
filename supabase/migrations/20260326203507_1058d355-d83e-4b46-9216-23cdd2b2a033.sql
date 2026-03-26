
CREATE TABLE public.envio_cobranca (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cobranca_id uuid REFERENCES public.cobrancas(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  cpf text NOT NULL,
  telefone text NOT NULL,
  data_envio date NOT NULL,
  tipo_envio text NOT NULL CHECK (tipo_envio IN ('D-1', 'D0')),
  status_fatura text NOT NULL,
  mensagem text NOT NULL,
  enviado_com_sucesso boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_envio_cobranca_cpf_data ON public.envio_cobranca (cpf, data_envio);

ALTER TABLE public.envio_cobranca ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view envio_cobranca"
  ON public.envio_cobranca FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert envio_cobranca"
  ON public.envio_cobranca FOR INSERT
  TO authenticated
  WITH CHECK (true);
