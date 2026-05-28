import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_PHONE = "5527999177265";

function formatCurrency(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatDate(d: string): string {
  return d.split("-").reverse().join("/");
}

import { evoSendText } from "../_shared/evolution.ts";
async function sendWhatsAppText(phone: string, message: string): Promise<boolean> {
  const r = await evoSendText(phone, message);
  if (!r.ok) console.error("[Evolution] Text send error:", r.status, r.error);
  return r.ok;
}


async function verifyMercadoPagoSignature(req: Request, paymentId: string, secret: string): Promise<boolean> {
  // MP envia: x-signature: ts=TIMESTAMP,v1=HEXHMAC ; x-request-id: REQ_ID
  // Manifest: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");
  if (!xSignature || !xRequestId) return false;

  const parts = Object.fromEntries(
    xSignature.split(",").map((kv) => {
      const [k, v] = kv.trim().split("=");
      return [k, v];
    })
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  // Anti-replay: rejeitar timestamps muito antigos (>5min)
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > 5 * 60 * 1000) return false;

  const manifest = `id:${paymentId};request-id:${xRequestId};ts:${ts};`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(manifest));
  const hex = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");

  // Timing-safe compare
  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

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

    // ── Signature verification (anti-spoofing) ──
    const WEBHOOK_SECRET = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
    if (WEBHOOK_SECRET) {
      const valid = await verifyMercadoPagoSignature(req, String(paymentId), WEBHOOK_SECRET);
      if (!valid) {
        console.warn("[MP Webhook] Invalid signature for payment", paymentId);
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.warn("[MP Webhook] MERCADOPAGO_WEBHOOK_SECRET not set — accepting unsigned (configure to enforce)");
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
        // Update or create payment record
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

        // Get client and cobranca info
        const { data: cob } = await supabase
          .from("cobrancas")
          .select("cliente_id, cliente_nome, valor_parcela")
          .eq("id", cobrancaId)
          .maybeSingle();

        let clienteNome = cob?.cliente_nome || "Cliente";
        let clienteTelefone = "";
        let clienteCpf = "";

        if (cob?.cliente_id) {
          const { data: cliente } = await supabase
            .from("clientes")
            .select("telefone, nome, cpf")
            .eq("id", cob.cliente_id)
            .maybeSingle();

          if (cliente) {
            clienteNome = cliente.nome || clienteNome;
            clienteTelefone = cliente.telefone || "";
            clienteCpf = cliente.cpf || "";
          }
        }

        const valorPago = mpData.transaction_amount || cob?.valor_parcela || 0;
        const dataFmt = formatDate(dataVencimento);
        const valorFmt = formatCurrency(valorPago);
        const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

        // 1. Send WhatsApp confirmation to CLIENT
        if (clienteTelefone) {
          let clientPhone = clienteTelefone.replace(/\D/g, "");
          if (clientPhone.startsWith("0")) clientPhone = clientPhone.slice(1);
          if (!clientPhone.startsWith("55")) clientPhone = "55" + clientPhone;

          const clientMsg = [
            `✅ *Pagamento Confirmado!*`,
            ``,
            `Olá, *${clienteNome}*! 👋`,
            ``,
            `Recebemos seu pagamento via PIX:`,
            ``,
            `━━━━━━━━━━━━━━━━━━`,
            `💰 *Valor:* ${valorFmt}`,
            `📅 *Parcela:* ${dataFmt}`,
            `🕐 *Recebido em:* ${agora}`,
            `━━━━━━━━━━━━━━━━━━`,
            ``,
            `📄 Em instantes você receberá o *comprovante em PDF* da SR Software.`,
            ``,
            `Obrigado pelo pagamento! 🎉`,
            ``,
            `*SR Software — Veloop* 🟢`,
          ].join("\n");
          await sendWhatsAppText(clientPhone, clientMsg);
        }

        // 2. Generate and send PDF receipt to client
        try {
          const receiptRes = await fetch(`${supabaseUrl}/functions/v1/generate-payment-receipt`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ cobranca_id: cobrancaId, data_vencimento: dataVencimento }),
          });
          const receiptData = await receiptRes.json();
          console.log("[MP Webhook] Receipt generated:", receiptData?.success, receiptData?.whatsapp_sent);
        } catch (err) {
          console.error("[MP Webhook] Failed to generate receipt:", err);
        }

        // 3. Notify ADMIN via WhatsApp with detailed info
        const cpfDisplay = clienteCpf
          ? clienteCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
          : "Não informado";

        const adminMsg = [
          `🔔 *PAGAMENTO PIX RECEBIDO*`,
          ``,
          `━━━━━━━━━━━━━━━━━━`,
          `📋 *DADOS DO PAGAMENTO*`,
          `━━━━━━━━━━━━━━━━━━`,
          ``,
          `👤 *Cliente:* ${clienteNome}`,
          `🆔 *CPF:* ${cpfDisplay}`,
          `📱 *Telefone:* ${clienteTelefone || "Não informado"}`,
          ``,
          `💰 *Valor Pago:* ${valorFmt}`,
          `📅 *Parcela:* ${dataFmt}`,
          `🕐 *Data/Hora:* ${agora}`,
          `💳 *Forma:* PIX (Mercado Pago)`,
          `🆔 *ID MP:* ${paymentId}`,
          ``,
          `━━━━━━━━━━━━━━━━━━`,
          `✅ *Status:* Parcela marcada como PAGA automaticamente na agenda.`,
          `📄 *Comprovante PDF:* Enviado ao cliente via WhatsApp.`,
          `━━━━━━━━━━━━━━━━━━`,
          ``,
          `*SR Software — Veloop* 🟢`,
        ].join("\n");
        await sendWhatsAppText(ADMIN_PHONE, adminMsg);

        // 4. Notify admins in-app
        const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
        for (const admin of adminRoles || []) {
          await supabase.from("notificacoes").insert({
            user_id: admin.user_id,
            titulo: "✅ PIX Recebido",
            mensagem: `${clienteNome} pagou ${valorFmt} — Parcela ${dataFmt} via Mercado Pago`,
            tipo: "pagamento_confirmado",
            dados: { cobranca_id: cobrancaId, data_vencimento: dataVencimento, mp_payment_id: String(paymentId), cliente_nome: clienteNome, valor: valorPago },
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
