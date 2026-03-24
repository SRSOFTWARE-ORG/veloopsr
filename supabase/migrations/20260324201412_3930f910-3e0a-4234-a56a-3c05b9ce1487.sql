
-- Add new columns to dispositivos
ALTER TABLE public.dispositivos 
  ADD COLUMN IF NOT EXISTS imei2 text,
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS memoria text,
  ADD COLUMN IF NOT EXISTS nome_dispositivo text,
  ADD COLUMN IF NOT EXISTS subcliente_id uuid REFERENCES public.clientes(id),
  ADD COLUMN IF NOT EXISTS subcliente_nome text;

-- Add parent_id to clientes for subcliente hierarchy
ALTER TABLE public.clientes 
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.clientes(id);
