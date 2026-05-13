import { supabase } from "@/integrations/supabase/client";

export interface VendaScheduleInput {
  vendaId: string;
  clienteId?: string | null;
  clienteNome: string;
  status: string; // 'concluida' | 'simulacao' | ...
  formaPagamento: string; // 'avista' | 'parcelado'
  valorEntrada: number;
  numParcelas: number;
  valorParcela: number;
  frequencia: string; // 'semana' | 'quinzena' | 'mes'
  dataInicioPagamento: string | null; // YYYY-MM-DD
  dataEntrada?: string | null; // YYYY-MM-DD
  criadoPor: string;
}

function addInterval(dateStr: string, freq: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  if (freq === "semana") d.setDate(d.getDate() + 7 * n);
  else if (freq === "quinzena") d.setDate(d.getDate() + 15 * n);
  else d.setMonth(d.getMonth() + n);
  return d.toISOString().split("T")[0];
}

/**
 * Apaga TODAS as cobranças/pagamentos antigos vinculados à venda e
 * reconstrói: 1 cobrança de entrada (se houver) + 1 cobrança de carnê
 * com N parcelas. Mantém a agenda 100% sincronizada com a venda.
 */
export async function rebuildVendaSchedule(input: VendaScheduleInput) {
  const {
    vendaId, clienteId, clienteNome, status, formaPagamento,
    valorEntrada, numParcelas, valorParcela, frequencia,
    dataInicioPagamento, dataEntrada, criadoPor,
  } = input;

  // 1) Apaga registros antigos vinculados a esta venda (por venda_id ou tag legada)
  const tag = `#${vendaId.slice(0, 8)}`;
  const { data: old } = await supabase
    .from("cobrancas")
    .select("id")
    .or(`venda_id.eq.${vendaId},observacoes.ilike.%${tag}%`);

  const oldIds = (old || []).map((c: any) => c.id);
  if (oldIds.length > 0) {
    await supabase.from("cobranca_pagamentos").delete().in("cobranca_id", oldIds);
    await supabase.from("cobrancas").delete().in("id", oldIds);
  }

  // Nada a recriar se a venda foi cancelada / simulada
  if (status !== "concluida") return;

  const cliId = clienteId || "00000000-0000-0000-0000-000000000000";

  // 2) Entrada (paga, do dia)
  if (valorEntrada > 0) {
    const dEntrada = dataEntrada || new Date().toISOString().split("T")[0];
    const { data: cobE } = await supabase.from("cobrancas").insert({
      venda_id: vendaId,
      cliente_id: cliId,
      cliente_nome: clienteNome,
      valor_parcela: valorEntrada,
      data_inicio: dEntrada,
      data_fim: dEntrada,
      frequencia: "mes",
      criado_por: criadoPor,
      observacoes: `Entrada da venda ${tag}`,
    } as any).select().single();
    if (cobE) {
      await supabase.from("cobranca_pagamentos").insert({
        cobranca_id: cobE.id,
        data_vencimento: dEntrada,
        status: "pago",
        pago_em: new Date().toISOString(),
        pago_por: criadoPor,
        tipo_pagamento: "entrada",
      });
    }
  }

  // 3) Parcelas (carnê) — só cria se for parcelado e tiver data de início
  if (formaPagamento === "parcelado" && numParcelas > 0 && dataInicioPagamento && valorParcela > 0) {
    const dataFim = addInterval(dataInicioPagamento, frequencia, numParcelas - 1);
    const { data: cobP } = await supabase.from("cobrancas").insert({
      venda_id: vendaId,
      cliente_id: cliId,
      cliente_nome: clienteNome,
      valor_parcela: valorParcela,
      data_inicio: dataInicioPagamento,
      data_fim: dataFim,
      frequencia,
      criado_por: criadoPor,
      observacoes: `Carnê da venda ${tag}`,
    } as any).select().single();

    if (cobP) {
      const pagamentos = Array.from({ length: numParcelas }, (_, i) => ({
        cobranca_id: cobP.id,
        data_vencimento: addInterval(dataInicioPagamento, frequencia, i),
        status: "a_pagar" as const,
        tipo_pagamento: "carne",
      }));
      await supabase.from("cobranca_pagamentos").insert(pagamentos);
    }
  }
}
