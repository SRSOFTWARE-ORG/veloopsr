import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // Find payments due tomorrow that are still pending
    const { data: pagamentos, error: pagErr } = await supabase
      .from("cobranca_pagamentos")
      .select("id, cobranca_id, data_vencimento, status")
      .eq("data_vencimento", tomorrowStr)
      .in("status", ["a_pagar"]);

    if (pagErr) throw pagErr;

    if (!pagamentos || pagamentos.length === 0) {
      return new Response(
        JSON.stringify({ message: "Nenhum pagamento vencendo amanhã", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get cobranca details for each payment
    const cobrancaIds = [...new Set(pagamentos.map((p) => p.cobranca_id))];
    const { data: cobrancas, error: cobErr } = await supabase
      .from("cobrancas")
      .select("id, cliente_nome, valor_parcela, criado_por")
      .in("id", cobrancaIds);

    if (cobErr) throw cobErr;

    const cobrancaMap = new Map(cobrancas?.map((c) => [c.id, c]) || []);

    // Get all admin users to notify them too
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const adminIds = adminRoles?.map((r) => r.user_id) || [];

    let notificacoesCreated = 0;

    for (const pagamento of pagamentos) {
      const cobranca = cobrancaMap.get(pagamento.cobranca_id);
      if (!cobranca) continue;

      const valor = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(cobranca.valor_parcela);

      const titulo = "Lembrete de Pagamento";
      const mensagem = `Amanhã vence a prestação do cliente ${cobranca.cliente_nome} no valor de ${valor}`;

      // Notify the creator and all admins
      const usersToNotify = new Set([cobranca.criado_por, ...adminIds]);

      for (const userId of usersToNotify) {
        // Check if notification already exists to avoid duplicates
        const { data: existing } = await supabase
          .from("notificacoes")
          .select("id")
          .eq("user_id", userId)
          .eq("tipo", "lembrete_pagamento")
          .contains("dados", { pagamento_id: pagamento.id })
          .maybeSingle();

        if (!existing) {
          await supabase.from("notificacoes").insert({
            user_id: userId,
            titulo,
            mensagem,
            tipo: "lembrete_pagamento",
            dados: {
              pagamento_id: pagamento.id,
              cobranca_id: pagamento.cobranca_id,
              cliente_nome: cobranca.cliente_nome,
              valor: cobranca.valor_parcela,
              data_vencimento: pagamento.data_vencimento,
            },
          });
          notificacoesCreated++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: `${notificacoesCreated} notificações criadas`,
        count: notificacoesCreated,
        pagamentos_encontrados: pagamentos.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
