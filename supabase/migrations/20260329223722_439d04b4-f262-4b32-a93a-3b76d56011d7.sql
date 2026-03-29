
-- Add data_entrada to vendas (editable date for when entry payment was received)
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS data_entrada date;

-- Add tipo_pagamento to cobranca_pagamentos to distinguish 'entrada' from 'carne'
ALTER TABLE public.cobranca_pagamentos ADD COLUMN IF NOT EXISTS tipo_pagamento text NOT NULL DEFAULT 'carne';
