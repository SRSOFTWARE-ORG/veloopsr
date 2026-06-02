## Objetivo

Adicionar fluxo de **Pagamento Parcial** na agenda de cobranças, com gestão de saldo restante (somar à próxima OU sub-parcela avulsa), juros automáticos por atraso, rolagem automática de sub-parcelas inadimplentes e comprovantes descritivos.

---

## 1. Mudanças no Banco de Dados

### Tabela `cobranca_pagamentos` — novos campos
- `valor_pago` (numeric) — valor efetivamente recebido no ato
- `valor_original` (numeric) — valor da parcela na data
- `juros_aplicado` (numeric, default 0) — juros somados ao valor original
- `saldo_restante` (numeric, default 0) — diferença não paga
- `destino_saldo` (text) — `proxima_parcela` | `sub_parcela` | `nenhum`

### Nova tabela `cobranca_sub_parcelas` (saldos avulsos / arrastados)
Campos:
- `cobranca_id` (uuid) — cobrança-mãe
- `parent_pagamento_id` (uuid) — pagamento que originou o saldo
- `parent_data_vencimento` (date) — parcela de origem
- `descricao` (text) — ex: "Saldo Restante — Parcela 03/2026"
- `valor` (numeric)
- `data_vencimento` (date)
- `status` (text: `a_pagar` | `pago` | `rolado`)
- `pago_em`, `pago_por`, `valor_pago`, `juros_aplicado`
- `rolado_para_data` (date, null) — quando movido para outra parcela
- `criado_por`

Com GRANTs, RLS (admins + dono da cobrança) e índices.

---

## 2. Edge Function nova — `register-partial-payment`

Entrada:
```ts
{ cobranca_id, data_vencimento, valor_pago, destino_saldo, data_sub_parcela?, dias_sub_parcela? }
```

Lógica:
1. Carrega cobrança + calcula valor original da parcela + juros (R$2/dia desde 1º dia atraso — já é regra).
2. Insere/atualiza `cobranca_pagamentos` com `valor_pago`, `juros_aplicado`, `saldo_restante`, `destino_saldo`, status `pago` (mesmo parcial).
3. Se `saldo_restante > 0`:
   - **Opção A (`proxima_parcela`)**: cria sub-parcela com `data_vencimento = próxima data da cobrança-mãe`, descrição "Saldo Restante — [parcela origem]".
   - **Opção B (`sub_parcela`)**: cria sub-parcela com data customizada.
4. Chama `generate-payment-receipt` com flag `parcial` + detalhamento.

---

## 3. Edge Function `generate-payment-receipt` — adaptações

- Aceitar `pagamento_id` opcional → ler `valor_pago`, `juros_aplicado`, `saldo_restante`, `destino_saldo`.
- Exibir SEMPRE apenas o valor pago no ato (não o valor total da parcela).
- Quebrar linha de detalhamento:
  - Valor original da parcela: R$ X
  - Juros por atraso (Y dias): R$ Z
  - **Total pago neste ato: R$ W**
  - Se sobrou saldo: "Saldo restante: R$ S — será cobrado em [data] / somado à parcela [mês]"
- Para pagamento de sub-parcela (Opção B): mostrar o "porquê" — descrição da sub-parcela e referência à parcela-mãe.
- Para pagamento que inclui saldo arrastado (Opção A no mês seguinte): "Valor da fatura [mês]: R$ A + Saldo restante da parcela [mês anterior]: R$ B".

---

## 4. Cron — rolagem automática de sub-parcelas vencidas

Nova edge function `roll-overdue-sub-parcelas` (chamada por `check-payment-reminders` que já roda diariamente):
- Busca `cobranca_sub_parcelas` com `status = 'a_pagar'` e `data_vencimento < hoje`.
- Para cada uma: marca como `rolado`, cria nova sub-parcela na próxima data de parcela vigente da cobrança-mãe, descrição "Saldo arrastado de [data]".

---

## 5. Frontend — `src/pages/AgendaPage.tsx`

Novo `PartialPaymentDialog`:
- Trigger: novo botão/opção "Pagamento Parcial" no menu de ações de uma parcela.
- Campos:
  - Valor original (read-only, com juros somados se vencida)
  - Input `CurrencyInput` — Valor Pago
  - Display do "Saldo Restante" calculado
  - Radio: **Somar à próxima parcela** | **Cobrança avulsa (data)** | **Cobrança avulsa (X dias)**
  - DatePicker / input numérico conforme escolha
- Submit → chama `register-partial-payment`.
- Mostra histórico de sub-parcelas dentro do detalhe da cobrança.

Exibição de sub-parcelas pendentes na lista da agenda (visualmente diferenciadas, badge "Saldo").

---

## 6. Histórico/Rastreabilidade

- Detalhe da parcela mostra: pagamentos parciais, sub-parcelas geradas, status (pago/rolado).
- Para cada sub-parcela: link/ref para parcela-mãe.
- Audit log já registra via padrão existente.

---

## Resumo técnico das mudanças

```
DB:
  + cobranca_pagamentos.{valor_pago, valor_original, juros_aplicado, saldo_restante, destino_saldo}
  + cobranca_sub_parcelas (nova tabela com RLS/GRANTs)

Edge functions:
  + register-partial-payment (novo)
  + roll-overdue-sub-parcelas (novo, chamado pelo cron diário)
  ~ generate-payment-receipt (suporta parcial + sub-parcela)
  ~ check-payment-reminders (invoca rolagem)

Frontend:
  + src/components/agenda/PartialPaymentDialog.tsx
  ~ src/pages/AgendaPage.tsx (botão, listagem sub-parcelas, exibição saldo)
```

Após aprovação, vou criar a migração primeiro (para você revisar), depois implementar edge functions e UI.
