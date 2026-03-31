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

    const body = await req.json();
    console.log("[MP Webhook] Received:", JSON.stringify(body));

    // Mercado Pago sends { action, type, data: { id } }
    if (body.type !== "payment" && body.action !== "payment.updated" && body.action !== "payment.created") {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentId = body.data?.id;
    if (!paymentId) {
      return new Response(JSON.stringify({ error: "No payment ID" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch payment details from MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { "Authorization": `Bearer ${MP_TOKEN}` },
    });
    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      console.error("[MP Webhook] Failed to fetch payment:", mpData);
      return new Response(JSON.stringify({ error: "Failed to fetch payment" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[MP Webhook] Payment status:", mpData.status, "ref:", mpData.external_reference);

    // Update pix_payments table
    await supabase
      .from("pix_payments")
      .update({ status: mpData.status, updated_at: new Date().toISOString() })
      .eq("mp_payment_id", String(paymentId));

    // If approved, auto-mark cobranca_pagamentos as paid
    if (mpData.status === "approved" && mpData.external_reference) {
      const [cobrancaId, dataVencimento] = mpData.external_reference.split("|");

      if (cobrancaId && dataVencimento) {
        // Check if payment record exists
        const { data: existingPag } = await supabase
          .from("cobranca_pagamentos")
          .select("id, status")
          .eq("cobranca_id", cobrancaId)
          .eq("data_vencimento", dataVencimento)
          .maybeSingle();

        if (existingPag) {
          if (existingPag.status !== "pago") {
            await supabase
              .from("cobranca_pagamentos")
              .update({ status: "pago", pago_em: new Date().toISOString(), tipo_pagamento: "pix_mercadopago" })
              .eq("id", existingPag.id);
          }
        } else {
          await supabase
            .from("cobranca_pagamentos")
            .insert({
              cobranca_id: cobrancaId,
              data_vencimento: dataVencimento,
              status: "pago",
              pago_em: new Date().toISOString(),
              tipo_pagamento: "pix_mercadopago",
            });
        }

        // Send WhatsApp confirmation
        const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
        const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");

        if (UAZAPI_URL && UAZAPI_TOKEN) {
          // Get client info
          const { data: cob } = await supabase
            .from("cobrancas")
            .select("cliente_id, cliente_nome, valor_parcela")
            .eq("id", cobrancaId)
            .maybeSingle();

          if (cob?.cliente_id) {
            const { data: cliente } = await supabase
              .from("clientes")
              .select("telefone, nome")
              .eq("id", cob.cliente_id)
              .maybeSingle();

            if (cliente?.telefone) {
              let phone = cliente.telefone.replace(/\D/g, "");
              if (phone.startsWith("0")) phone = phone.slice(1);
              if (!phone.startsWith("55")) phone = "55" + phone;

              const valorFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(mpData.transaction_amount || cob.valor_parcela);
              const dataFmt = dataVencimento.split("-").reverse().join("/");

              const msg = [
                `✅ *Pagamento Confirmado!*`,
                ``,
                `Olá, *${cliente.nome || cob.cliente_nome}*! 👋`,
                ``,
                `Recebemos seu pagamento via PIX:`,
                ``,
                `━━━━━━━━━━━━━━━━━━`,
                `💰 *Valor:* ${valorFmt}`,
                `📅 *Parcela:* ${dataFmt}`,
                `🕐 *Recebido em:* ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
                `━━━━━━━━━━━━━━━━━━`,
                ``,
                `Obrigado pelo pagamento! 🎉`,
                ``,
                `*SR Software — Veloop* 🟢`,
              ].join("\n");

              const apiUrl = UAZAPI_URL.replace(/\/+$/, "");
              await fetch(`${apiUrl}/send/text`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "token": UAZAPI_TOKEN },
                body: JSON.stringify({ number: phone, text: msg, linkPreview: false }),
              });
            }
          }
        }

        // Notify admins
        const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
        for (const admin of adminRoles || []) {
          await supabase.from("notificacoes").insert({
            user_id: admin.user_id,
            titulo: "✅ PIX Recebido",
            mensagem: `Pagamento de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(mpData.transaction_amount)} confirmado via Mercado Pago`,
            tipo: "pagamento_confirmado",
            dados: { cobranca_id: cobrancaId, data_vencimento: dataVencimento, mp_payment_id: String(paymentId) },
          });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[MP Webhook] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
