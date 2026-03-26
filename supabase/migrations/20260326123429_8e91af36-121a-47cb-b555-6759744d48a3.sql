
-- 1. Delete duplicate cobranças (keep CARNÊ, delete NOTA duplicates)
-- First delete their pagamentos
DELETE FROM cobranca_pagamentos WHERE cobranca_id IN (
  SELECT id FROM cobrancas WHERE observacoes ILIKE '%NOTA %'
  AND cliente_nome IN (
    SELECT cliente_nome FROM cobrancas GROUP BY cliente_nome HAVING count(*) > 1
  )
);

-- Then delete the NOTA cobranças for duplicated clients
DELETE FROM cobrancas WHERE observacoes ILIKE '%NOTA %'
AND cliente_nome IN (
  SELECT cliente_nome FROM cobrancas GROUP BY cliente_nome HAVING count(*) > 1
);

-- 2. Delete duplicate vendas (keep originals from 2026-03-20/24, delete 2026-03-26 duplicates)
-- Delete venda_itens first
DELETE FROM venda_itens WHERE venda_id IN (
  'a89893d9-cb0e-4814-9c19-660823a768cb',
  'a4eca827-b7db-4cf1-aadc-a58dda0c0119',
  '403a95eb-85e5-4ac6-a3a7-3787c04ce159',
  'f88bff14-a2f8-4a73-ad2d-324def8e59de',
  'aeaa0da4-20bd-441c-a114-62c2632eabfa',
  '79dbf33a-4fe2-49a3-a063-f84970a276db',
  '90340201-5869-406f-8292-22472e2ee29c',
  '45c5899f-edd6-47b8-b904-75c8a9151fe1',
  'e5ac8ec4-b942-44f5-8892-31dfc67e6029',
  '0e889448-5e5f-4868-86d1-8b5722d947fe',
  '834cae79-273e-438c-9ec1-80530f58857c',
  'ef177db7-4301-444f-a945-fa64ad5a9dd4',
  '1a5b4a70-bd90-48d5-b4d7-760a1818b163'
);

-- Delete the duplicate vendas
DELETE FROM vendas WHERE id IN (
  'a89893d9-cb0e-4814-9c19-660823a768cb',
  'a4eca827-b7db-4cf1-aadc-a58dda0c0119',
  '403a95eb-85e5-4ac6-a3a7-3787c04ce159',
  'f88bff14-a2f8-4a73-ad2d-324def8e59de',
  'aeaa0da4-20bd-441c-a114-62c2632eabfa',
  '79dbf33a-4fe2-49a3-a063-f84970a276db',
  '90340201-5869-406f-8292-22472e2ee29c',
  '45c5899f-edd6-47b8-b904-75c8a9151fe1',
  'e5ac8ec4-b942-44f5-8892-31dfc67e6029',
  '0e889448-5e5f-4868-86d1-8b5722d947fe',
  '834cae79-273e-438c-9ec1-80530f58857c',
  'ef177db7-4301-444f-a945-fa64ad5a9dd4',
  '1a5b4a70-bd90-48d5-b4d7-760a1818b163'
);

-- 3. Fix Geiziane cobrança name to match the correct client name
UPDATE cobrancas SET cliente_nome = 'GEIZIANE SANTO DE OLIVEIRA' WHERE cliente_nome = 'Geiziane santos de oliveira';
