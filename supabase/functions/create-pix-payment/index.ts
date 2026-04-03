import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const MP_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!MP_TOKEN) throw new Error("MERCADOPAGO_ACCESS_TOKEN not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { cobranca_id, data_vencimento, valor, cliente_nome, cliente_id } = await req.json();

    if (!cobranca_id || !data_vencimento || !valor) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    const idempotencyKey = `${cobranca_id}_${data_vencimento}`;
    const description = `Parcela ${data_vencimento} - ${cliente_nome || "Cliente"}`;

    const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MP_TOKEN}`,
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        transaction_amount: parseFloat(valor),
        description,
        payment_method_id: "pix",
        payer: {
          email: "cliente@email.com",
          first_name: cliente_nome || "Cliente",
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
        cliente_id: cliente_id || null,
        valor: parseFloat(valor),
        mp_payment_id: String(mpData.id),
        mp_qr_code_base64: qrCodeBase64,
        mp_copia_cola: copiaCola,
        status: mpData.status || "pending",
      }, { onConflict: "cobranca_id,data_vencimento", ignoreDuplicates: false })
      .select()
      .single();

    if (dbError) {
      // Fallback: insert without upsert
      await supabase.from("pix_payments").insert({
        cobranca_id,
        data_vencimento,
        cliente_id: cliente_id || null,
        valor: parseFloat(valor),
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
        valor: parseFloat(valor),
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
