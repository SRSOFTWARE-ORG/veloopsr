CREATE TABLE IF NOT EXISTS public.ai_action_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_action_confirmations_user_expiry_idx
  ON public.ai_action_confirmations (user_id, expires_at);

ALTER TABLE public.ai_action_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_action_confirmations FROM anon, authenticated;
GRANT ALL ON TABLE public.ai_action_confirmations TO service_role;
