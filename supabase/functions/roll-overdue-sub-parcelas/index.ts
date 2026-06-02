import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function fmtDate(d: Date): string { return d.toISOString().slice(0, 10); }
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

function nextProjected(cob: any, after: string, hoje: string): string {
  const all = generateDates(cob.data_inicio, cob.data_fim, cob.frequencia);
  for (const d of all) {
    if (d > hoje && d > after) return d;
  }
  // fora do intervalo: projeta a partir de hoje + 1 frequência
  const d = new Date(`${hoje}T00:00:00.000Z`);
  let next: Date;
  if (cob.frequencia === "semana") next = new Date(d.getTime() + 7 * DAY_MS);
  else if (cob.frequencia === "quinzena") next = new Date(d.getTime() + 15 * DAY_MS);
  else next = addMonthsPreservingDay(d, 1);
  return fmtDate(next);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const hoje = fmtDate(new Date());

    const { data: vencidas, error } = await supabase
      .from("cobranca_sub_parcelas")
      .select("*")
      .eq("status", "a_pagar")
      .lt("data_vencimento", hoje);
    if (error) throw error;

    let movidas = 0;
    for (const sp of vencidas || []) {
      const { data: cob } = await supabase
        .from("cobrancas").select("*").eq("id", sp.cobranca_id).single();
      if (!cob) continue;

      const novaData = nextProjected(cob, sp.data_vencimento, hoje);

      // marca a atual como rolada
      await supabase.from("cobranca_sub_parcelas")
        .update({ status: "rolado", rolado_para_data: novaData })
        .eq("id", sp.id);

      // cria nova sub-parcela com saldo arrastado
      await supabase.from("cobranca_sub_parcelas").insert({
        cobranca_id: sp.cobranca_id,
        parent_pagamento_id: sp.parent_pagamento_id,
        parent_data_vencimento: sp.parent_data_vencimento || sp.data_vencimento,
        descricao: `Saldo arrastado de ${sp.data_vencimento.split("-").reverse().join("/")} (${sp.descricao})`,
        valor: Number(sp.valor),
        data_vencimento: novaData,
        origem: "rolagem_automatica",
        criado_por: sp.criado_por,
      });
      movidas++;
    }

    return new Response(JSON.stringify({ success: true, total_roladas: movidas }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("roll-overdue-sub-parcelas error:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
