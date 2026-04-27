
CREATE TABLE IF NOT EXISTS public.scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  provider text NOT NULL,
  status text NOT NULL,
  http_status integer,
  attempts integer DEFAULT 1,
  latency_ms integer,
  error_message text,
  nome_arquivo text,
  user_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.scan_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view scan_logs"
  ON public.scan_logs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System insert scan_logs"
  ON public.scan_logs FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_scan_logs_created_at ON public.scan_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_logs_function ON public.scan_logs(function_name);
