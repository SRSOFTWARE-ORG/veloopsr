
ALTER TABLE public.vendas 
  ADD COLUMN frequencia_parcela TEXT DEFAULT 'mes',
  ADD COLUMN data_inicio_pagamento DATE,
  ADD COLUMN forma_pagamento TEXT DEFAULT 'parcelado';
