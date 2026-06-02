import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const JUROS_DIA = 2; // R$ 2,00 por dia (regra do negócio)

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addMonthsPreservingDay(date: Date, months: number): Date {
  const next = new Date(date);
  const originalDay = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(originalDay, lastDay));
  return next;
}

function generateDates(dataInicio: string, dataFim: string, frequencia: string): string[] {
  const start = new Date(`${dataInicio}T00:00:00.000Z`);
  const end = new Date(`${dataFim}T00:00:00.000Z`);
  const dates: string[] = [];
  let current = new Date(start);
  while (current <= end) {
    dates.push(fmtDate(current));
    if (frequencia === "semana") current = new Date(current.getTime() + 7 * DAY_MS);
    else if (frequencia === "quinzena") current = new Date(current.getTime() + 15 * DAY_MS);
    else current = addMonthsPreservingDay(current, 1);
  }
  return dates;
}

function nextDateFor(cobranca: any, after: string): string {
  const all = generateDates(cobranca.data_inicio, cobranca.data_fim, cobranca.frequencia);
  const idx = all.indexOf(after);
  if (idx >= 0 && idx < all.length - 1) return all[idx + 1];
  // se for a última, projeta uma próxima
  const d = new Date(`${after}T00:00:00.000Z`);
  let next: Date;
  if (cobranca.frequencia === "semana") next = new Date(d.getTime() + 7 * DAY_MS);
  else if (cobranca.frequencia === "quinzena") next = new Date(d.getTime() + 15 * DAY_MS);
  else next = addMonthsPreservingDay(d, 1);
  return fmtDate(next);
}

function calcJurosAtraso(dataVencimento: string, hoje: Date): number {
  const venc = new Date(`${dataVencimento}T00:00:00.000Z`);
  const diff = Math.floor((hoje.getTime() - venc.getTime()) / DAY_MS);
  if (diff <= 0) return 0;
  return diff * JUROS_DIA;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authToken = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth user
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${authToken}`, apikey: anonKey },
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userData = await userRes.json();
    const userId = userData.id as string;

    const body = await req.json();
    const {
      cobranca_id,
      data_vencimento,
      valor_pago,
      destino_saldo, // 'proxima_parcela' | 'sub_parcela' | 'nenhum'
      data_sub_parcela, // YYYY-MM-DD (opção B com data)
      dias_sub_parcela, // number (opção B com prazo)
      descricao_sub,
      sub_parcela_id, // se o pagamento for de uma sub-parcela existente
    } = body;

    if (!cobranca_id || !data_vencimento || valor_pago == null || valor_pago < 0) {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Carrega cobrança
    const { data: cob, error: cobErr } = await supabase
      .from("cobrancas").select("*").eq("id", cobranca_id).single();
    if (cobErr || !cob) throw new Error("Cobrança não encontrada");

    const hoje = new Date();
    let valorOriginal: number;
    let juros = 0;
    let isSubParcela = false;

    if (sub_parcela_id) {
      // pagamento de sub-parcela existente
      const { data: sp } = await supabase
        .from("cobranca_sub_parcelas").select("*").eq("id", sub_parcela_id).single();
      if (!sp) throw new Error("Sub-parcela não encontrada");
      valorOriginal = Number(sp.valor);
      juros = calcJurosAtraso(sp.data_vencimento, hoje);
      isSubParcela = true;
    } else {
      valorOriginal = Number(cob.valor_parcela);
      juros = calcJurosAtraso(data_vencimento, hoje);
    }

    const totalDevido = valorOriginal + juros;
    const pago = Number(valor_pago);
    const saldoRestante = Math.max(0, totalDevido - pago);
    const isParcial = saldoRestante > 0.009;

    let pagamentoId: string | null = null;
    let novaCobrancaId: string | null = null;
    let novaCobrancaData: string | null = null;

    // 1) Registrar o pagamento (parcial ou total) na origem
    if (isSubParcela) {
      const { error: spErr } = await supabase
        .from("cobranca_sub_parcelas")
        .update({
          status: "pago",
          valor_pago: pago,
          juros_aplicado: juros,
          pago_em: new Date().toISOString(),
          pago_por: userId,
        })
        .eq("id", sub_parcela_id);
      if (spErr) throw spErr;
    } else {
      const { data: existing } = await supabase
        .from("cobranca_pagamentos")
        .select("id")
        .eq("cobranca_id", cobranca_id)
        .eq("data_vencimento", data_vencimento)
        .maybeSingle();

      const payload = {
        cobranca_id,
        data_vencimento,
        status: "pago",
        tipo_pagamento: "carne",
        pago_em: new Date().toISOString(),
        pago_por: userId,
        valor_pago: pago,
        valor_original: valorOriginal,
        juros_aplicado: juros,
        saldo_restante: saldoRestante,
        destino_saldo: isParcial ? (destino_saldo || "nenhum") : null,
      };

      if (existing?.id) {
        const { data, error } = await supabase
          .from("cobranca_pagamentos")
          .update(payload).eq("id", existing.id).select().single();
        if (error) throw error;
        pagamentoId = data.id;
      } else {
        const { data, error } = await supabase
          .from("cobranca_pagamentos").insert(payload).select().single();
        if (error) throw error;
        pagamentoId = data.id;
      }
    }

    // 2) Se houver saldo restante, cria NOVA COBRANÇA (cobrança normal de 1 parcela)
    if (isParcial && destino_saldo && destino_saldo !== "nenhum") {
      const novaData = destino_saldo === "proxima_parcela"
        ? nextDateFor(cob, data_vencimento)
        : (data_sub_parcela ?? fmtDate(new Date(hoje.getTime() + (Number(dias_sub_parcela) || 7) * DAY_MS)));

      const dataRefBr = data_vencimento.split("-").reverse().join("/");
      const obs = descricao_sub || `Saldo restante da parcela ${dataRefBr} de ${cob.cliente_nome}`;

      const { data: novaCob, error: ncErr } = await supabase.from("cobrancas").insert({
        cliente_id: cob.cliente_id,
        cliente_nome: cob.cliente_nome,
        valor_parcela: saldoRestante,
        frequencia: cob.frequencia || "mes",
        data_inicio: novaData,
        data_fim: novaData,
        criado_por: userId,
        observacoes: obs,
      }).select().single();
      if (ncErr) throw ncErr;
      novaCobrancaId = novaCob?.id ?? null;
      novaCobrancaData = novaData;
    }

    // Aciona comprovante PDF/WhatsApp em background
    supabase.functions.invoke("generate-payment-receipt", {
      body: {
        cobranca_id,
        data_vencimento,
        pagamento_id: pagamentoId,
        sub_parcela_id: isSubParcela ? sub_parcela_id : null,
        parcial: true,
        valor_pago: pago,
        juros_aplicado: juros,
        valor_original: valorOriginal,
        saldo_restante: saldoRestante,
        destino_saldo: isParcial ? destino_saldo : null,
        sub_parcela_nova_data: subParcelaNovaData,
      },
    }).catch((e) => console.error("Receipt invoke failed:", e));

    return new Response(JSON.stringify({
      success: true,
      pagamento_id: pagamentoId,
      sub_parcela_id: subParcelaNovaId,
      sub_parcela_data: subParcelaNovaData,
      saldo_restante: saldoRestante,
      juros_aplicado: juros,
      valor_original: valorOriginal,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("register-partial-payment error:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
