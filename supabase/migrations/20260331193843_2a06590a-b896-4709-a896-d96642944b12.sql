
-- Conversations table: tracks per-contact chat status
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'auto', -- 'auto' or 'manual'
  stage text NOT NULL DEFAULT 'idle', -- 'idle', 'awaiting_cpf'
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage conversations" ON public.conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Messages table: stores conversation history
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL, -- 'user', 'assistant', 'system'
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view messages" ON public.messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can insert messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (true);
