
-- Update vendas that reference the duplicate client name to the correct one
UPDATE vendas SET cliente_nome = 'GEIZIANE SANTO DE OLIVEIRA' WHERE cliente_nome = 'Geiziane santos de oliveira';

-- Delete the duplicate client (the one with less data)
DELETE FROM clientes WHERE id = 'e1d96980-2b67-4133-b238-5289515effa2';

-- Create unique index on CPF to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_cpf_unique ON clientes (cpf) WHERE cpf IS NOT NULL AND cpf != '';
