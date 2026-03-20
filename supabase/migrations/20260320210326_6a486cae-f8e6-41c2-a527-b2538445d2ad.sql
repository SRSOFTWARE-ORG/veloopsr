UPDATE public.documentos SET tipo = 'nota_fiscal' WHERE UPPER(nome_arquivo) LIKE 'NOTA%' AND tipo = 'outro';
UPDATE public.documentos SET tipo = 'carne' WHERE (UPPER(nome_arquivo) LIKE 'CARN%') AND tipo = 'outro';
UPDATE public.documentos SET tipo = 'contrato' WHERE UPPER(nome_arquivo) LIKE 'CONTRATO%' AND tipo = 'outro';
UPDATE public.documentos SET tipo = 'recibo_garantia' WHERE (UPPER(nome_arquivo) LIKE 'RECIBO%' OR UPPER(nome_arquivo) LIKE '%GARANTIA%') AND tipo = 'outro';