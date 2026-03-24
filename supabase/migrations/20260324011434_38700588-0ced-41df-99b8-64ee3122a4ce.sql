-- Add cliente_id FK to dispositivos
ALTER TABLE public.dispositivos ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

-- Add dispositivo_id and cliente_id FK to assistencias
ALTER TABLE public.assistencias ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;
ALTER TABLE public.assistencias ADD COLUMN IF NOT EXISTS dispositivo_id uuid REFERENCES public.dispositivos(id) ON DELETE SET NULL;

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispositivos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.assistencias;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clientes;