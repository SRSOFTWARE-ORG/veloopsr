import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function generateDueDates(startDate: string, endDate: string, frequency: string): string[] {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) return [];
  const dates: string[] = [];
  let current = new Date(start);
  for (let i = 0; i < 600 && current <= end; i++) {
    dates.push(current.toISOString().slice(0, 10));
    if (frequency === "semana") {
      current = new Date(current.getTime() + 7 * DAY_MS);
    } else if (frequency === "quinzena") {
      current = new Date(current.getTime() + 15 * DAY_MS);
    } else {
      const day = current.getUTCDate();
      current.setUTCDate(1);
      current.setUTCMonth(current.getUTCMonth() + 1);
      const lastDay = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0)).getUTCDate();
      current.setUTCDate(Math.min(day, lastDay));
    }
  }
  return dates;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const MP_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");

    const body = await req.json().catch(() => ({}));

    // Healthcheck mode: just report whether the token is configured
    if (body?.health === true) {
      return new Response(
        JSON.stringify({ ok: !!MP_TOKEN, configured: !!MP_TOKEN }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!MP_TOKEN) throw new Error("MERCADOPAGO_ACCESS_TOKEN not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { cobranca_id, data_vencimento, cliente_nome, cliente_id } = body;

    if (
      typeof cobranca_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cobranca_id) ||
      typeof data_vencimento !== "string" ||
      !/^\\d{4}-\\d{2}-\\d{2}$/.test(data_vencimento) ||
      !Number.isFinite(Date.parse(`${data_vencimento}T00:00:00.000Z`)) ||
      new Date(`${data_vencimento}T00:00:00.000Z`).toISOString().slice(0, 10) !== data_vencimento
    ) {
      return new Response(JSON.stringify({ error: "Identificador ou data de vencimento inválidos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Never trust the amount or customer identity supplied by a public payment link.
    const { data: cobranca, error: cobErr } = await supabase
      .from("cobrancas")
      .select("valor_parcela, cliente_nome, cliente_id, data_inicio, data_fim, frequencia")
      .eq("id", cobranca_id)
      .maybeSingle();

    if (cobErr || !cobranca) {
      return new Response(JSON.stringify({ error: "Cobrança não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dueDates = generateDueDates(cobranca.data_inicio, cobranca.data_fim, cobranca.frequencia);
    if (!dueDates.includes(data_vencimento)) {
      return new Response(JSON.stringify({ error: "A data informada não pertence às parcelas desta cobrança" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: installmentStatus, error: installmentError } = await supabase
      .from("cobranca_pagamentos")
      .select("status")
      .eq("cobranca_id", cobranca_id)
      .eq("data_vencimento", data_vencimento)
      .maybeSingle();
    if (installmentError) throw installmentError;
    if (["pago", "isento"].includes(String(installmentStatus?.status || "").toLowerCase())) {
      return new Response(JSON.stringify({ error: "Esta parcela já está quitada ou isenta" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const valorBase = Number(cobranca.valor_parcela || 0);
    if (!(valorBase > 0)) {
      return new Response(JSON.stringify({ error: "Cobrança com valor inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Juros R$3/dia desde o 1º dia de atraso (alinhado com o front)
    const hoje = new Date();
    hoje.setUTCHours(0, 0, 0, 0);
    const venc = new Date(`${data_vencimento}T00:00:00Z`);
    const diasAtraso = Math.max(0, Math.floor((hoje.getTime() - venc.getTime()) / 86400000));
    const juros = diasAtraso * 3;
    const valor = +(valorBase + juros).toFixed(2);

    const nomeCliente = cobranca.cliente_nome || "Cliente";

    // Check for existing active payment
    const { data: existing } = await supabase
      .from("pix_payments")
      .select("id, mp_qr_code_base64, mp_copia_cola, status, mp_payment_id")
      .eq("cobranca_id", cobranca_id)
      .eq("data_vencimento", data_vencimento)
      .in("status", ["pending", "approved"])
      .maybeSingle();

    if (existing?.status === "approved") {
      return new Response(JSON.stringify({ already_paid: true, payment: existing }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (existing?.mp_copia_cola) {
      return new Response(JSON.stringify({ payment: existing }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create PIX payment via Mercado Pago
    const idempotencyKey = `${cobranca_id}_${data_vencimento}_${valor}`;
    const description = `Parcela ${data_vencimento} - ${nomeCliente}`;


    const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MP_TOKEN}`,
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        transaction_amount: valor,
        description,
        payment_method_id: "pix",
        payer: {
          email: "cliente@email.com",
          first_name: nomeCliente,
        },
        notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
        external_reference: `${cobranca_id}|${data_vencimento}`,
      }),
    });


    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("MP Error:", JSON.stringify(mpData));
      const mpMsg = mpData?.message || "";
      const userError = mpMsg.includes("key enabled for QR")
        ? "A conta Mercado Pago não possui chave PIX cadastrada. Entre em contato com o vendedor."
        : "Erro ao gerar pagamento PIX. Tente novamente em instantes.";
      return new Response(JSON.stringify({ error: userError, mp_error: mpMsg }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pixInfo = mpData.point_of_interaction?.transaction_data;
    const qrCodeBase64 = pixInfo?.qr_code_base64 || "";
    const copiaCola = pixInfo?.qr_code || "";

    // Save to database
    const { data: payment, error: dbError } = await supabase
      .from("pix_payments")
      .upsert({
        cobranca_id,
        data_vencimento,
        cliente_id: cobranca.cliente_id || null,
        valor,
        mp_payment_id: String(mpData.id),
        mp_qr_code_base64: qrCodeBase64,
        mp_copia_cola: copiaCola,
        status: mpData.status || "pending",
      }, { onConflict: "cobranca_id,data_vencimento", ignoreDuplicates: false })
      .select()
      .single();

    if (dbError) {
      await supabase.from("pix_payments").insert({
        cobranca_id,
        data_vencimento,
        cliente_id: cliente_id || null,
        valor,
        mp_payment_id: String(mpData.id),
        mp_qr_code_base64: qrCodeBase64,
        mp_copia_cola: copiaCola,
        status: mpData.status || "pending",
      });
    }

    return new Response(JSON.stringify({
      payment: {
        mp_payment_id: String(mpData.id),
        mp_qr_code_base64: qrCodeBase64,
        mp_copia_cola: copiaCola,
        status: mpData.status,
        valor,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },

    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
