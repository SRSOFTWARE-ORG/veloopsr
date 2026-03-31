import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * WhatsApp AI Chatbot via UAZAPI webhook.
 * - Responds to all incoming messages using AI
 * - Handles invoice/payment queries by asking for CPF
 * - Looks up CPF in the database and returns pending payment info
 */

// In-memory conversation state (per phone number)
// In production, consider using a database table for persistence
const conversationState = new Map<string, {
  stage: "idle" | "awaiting_cpf";
  history: Array<{ role: string; content: string }>;
  lastActivity: number;
}>();

function getState(phone: string) {
  let state = conversationState.get(phone);
  if (!state || Date.now() - state.lastActivity > 30 * 60 * 1000) {
    // Reset after 30 min inactivity
    state = { stage: "idle", history: [], lastActivity: Date.now() };
    conversationState.set(phone, state);
  }
  state.lastActivity = Date.now();
  return state;
}

async function sendWhatsApp(phone: string, message: string) {
  const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
  const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
  if (!UAZAPI_URL || !UAZAPI_TOKEN) {
    console.error("UAZAPI not configured");
    return false;
  }
  const apiUrl = UAZAPI_URL.replace(/\/+$/, "");
  try {
    const res = await fetch(`${apiUrl}/message/send-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "token": UAZAPI_TOKEN },
      body: JSON.stringify({ phone, message }),
    });
    const result = await res.json();
    return res.ok && !result.error;
  } catch (e) {
    console.error("sendWhatsApp error:", e);
    return false;
  }
}

async function callAI(messages: Array<{ role: string; content: string }>): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return "Desculpe, o assistente está temporariamente indisponível.";

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
      }),
    });

    if (!res.ok) {
      console.error("AI gateway error:", res.status);
      return "Desculpe, não consegui processar sua mensagem no momento. Tente novamente.";
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "Desculpe, não entendi. Pode repetir?";
  } catch (e) {
    console.error("AI call error:", e);
    return "Desculpe, ocorreu um erro. Tente novamente em alguns instantes.";
  }
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const event = body.event || body.type || "unknown";
    const sender = body.data?.key?.remoteJid || body.sender || null;
    const messageContent =
      body.data?.message?.conversation ||
      body.data?.message?.extendedTextMessage?.text ||
      null;
    const fromMe = body.data?.key?.fromMe || false;

    console.log(`[UAZAPI Webhook] Event: ${event}, From: ${sender}, FromMe: ${fromMe}`);

    // Audit log
    await supabase.from("audit_log").insert({
      tabela: "whatsapp_uazapi",
      acao: "webhook_recebido",
      detalhes: {
        event,
        sender: sender ? sender.replace(/\d(?=\d{4})/g, "*") : null,
        has_message: !!messageContent,
        from_me: fromMe,
        timestamp: new Date().toISOString(),
      },
    });

    // Forward to n8n if configured
    const webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "uazapi_incoming",
          event,
          sender,
          message: messageContent,
          raw: body,
          timestamp: new Date().toISOString(),
        }),
      }).catch((e) => console.warn("[n8n forward] error:", e));
    }

    // Only process incoming messages (not from us, and only messages.upsert)
    if (event === "messages.upsert" && sender && messageContent && !fromMe) {
      const phoneClean = sender.replace("@s.whatsapp.net", "").replace(/\D/g, "");
      const state = getState(phoneClean);
      const msgLower = messageContent.trim().toLowerCase();

      // ─── Stage: Awaiting CPF ───
      if (state.stage === "awaiting_cpf") {
        const cpfDigits = messageContent.replace(/\D/g, "");

        if (cpfDigits.length === 11 || cpfDigits.length === 14) {
          // Look up client by CPF
          const { data: cliente } = await supabase
            .from("clientes")
            .select("id, nome, cpf, telefone")
            .eq("cpf", messageContent.trim())
            .maybeSingle();

          // Also try with just digits
          let clienteMatch = cliente;
          if (!clienteMatch) {
            const { data: c2 } = await supabase
              .from("clientes")
              .select("id, nome, cpf, telefone")
              .ilike("cpf", `%${cpfDigits}%`)
              .limit(1)
              .maybeSingle();
            clienteMatch = c2;
          }

          if (!clienteMatch) {
            await sendWhatsApp(phoneClean,
              "❌ Não encontrei nenhum cliente com esse CPF no nosso sistema.\n\n" +
              "Verifique se digitou corretamente ou entre em contato com a loja para mais informações."
            );
            state.stage = "idle";
            state.history.push(
              { role: "user", content: messageContent },
              { role: "assistant", content: "CPF não encontrado no sistema." }
            );
          } else {
            // Found client — look up pending payments
            const { data: cobrancas } = await supabase
              .from("cobrancas")
              .select("id, valor_parcela, cliente_nome")
              .eq("cliente_id", clienteMatch.id);

            let pendingInfo = "";
            if (cobrancas && cobrancas.length > 0) {
              const cobrancaIds = cobrancas.map((c) => c.id);
              const { data: parcelas } = await supabase
                .from("cobranca_pagamentos")
                .select("id, cobranca_id, data_vencimento, status")
                .in("cobranca_id", cobrancaIds)
                .in("status", ["a_pagar", "pendente"])
                .order("data_vencimento", { ascending: true })
                .limit(5);

              if (parcelas && parcelas.length > 0) {
                const cobrancaMap = new Map(cobrancas.map((c) => [c.id, c]));
                const lines = parcelas.map((p) => {
                  const cob = cobrancaMap.get(p.cobranca_id);
                  const valor = cob ? formatCurrency(cob.valor_parcela) : "N/A";
                  const venc = formatDate(p.data_vencimento);
                  const statusLabel = p.status === "pendente" ? "⚠️ ATRASADA" : "📅 A pagar";
                  return `• ${statusLabel} — Vencimento: ${venc} — Valor: ${valor}`;
                });
                pendingInfo =
                  `Olá, *${clienteMatch.nome}*! 👋\n\n` +
                  `Aqui estão suas próximas parcelas:\n\n` +
                  lines.join("\n") +
                  `\n\nSe precisar de mais informações, é só perguntar! 😊`;
              } else {
                pendingInfo =
                  `Olá, *${clienteMatch.nome}*! 👋\n\n` +
                  `✅ Você não possui parcelas pendentes no momento. Está tudo em dia!\n\n` +
                  `Se tiver outra dúvida, é só perguntar.`;
              }
            } else {
              pendingInfo =
                `Olá, *${clienteMatch.nome}*! 👋\n\n` +
                `Não encontrei cobranças associadas ao seu cadastro.\n\n` +
                `Entre em contato com a loja para mais informações.`;
            }

            await sendWhatsApp(phoneClean, pendingInfo);
            state.stage = "idle";
            state.history.push(
              { role: "user", content: messageContent },
              { role: "assistant", content: pendingInfo }
            );
          }
        } else {
          await sendWhatsApp(phoneClean,
            "Por favor, envie seu *CPF* com 11 dígitos (ou CNPJ com 14 dígitos).\n\nExemplo: 123.456.789-00"
          );
        }

        // Notify admins about the interaction
        await notifyAdmins(supabase, phoneClean, messageContent);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ─── Stage: Idle — Check if asking about invoices/faturas ───
      const invoiceKeywords = [
        "fatura", "parcela", "boleto", "pagamento", "pagar", "vencimento",
        "quanto devo", "minha conta", "pendente", "cobrança", "cobranças",
        "próxima parcela", "próximo pagamento", "dívida", "débito",
      ];
      const isInvoiceQuery = invoiceKeywords.some((kw) => msgLower.includes(kw));

      if (isInvoiceQuery) {
        state.stage = "awaiting_cpf";
        const reply =
          "Para consultar suas parcelas, preciso do seu *CPF*. 📋\n\n" +
          "Por favor, envie seu CPF (somente números ou com pontuação):";
        await sendWhatsApp(phoneClean, reply);
        state.history.push(
          { role: "user", content: messageContent },
          { role: "assistant", content: reply }
        );
        await notifyAdmins(supabase, phoneClean, messageContent);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ─── General AI conversation ───
      const systemPrompt = {
        role: "system",
        content:
          "Você é o assistente virtual da Veloop, uma loja de celulares e eletrônicos. " +
          "Seja cordial, simpático e objetivo. Responda em português brasileiro. " +
          "Se o cliente perguntar sobre faturas, parcelas, pagamentos ou boletos, peça o CPF dele. " +
          "Você pode responder perguntas gerais sobre a loja, horário de funcionamento, produtos, etc. " +
          "Mantenha as respostas curtas e adequadas para WhatsApp (sem formatação markdown complexa, use *negrito* e emojis). " +
          "Se não souber uma informação específica, sugira que o cliente entre em contato diretamente com a loja.",
      };

      state.history.push({ role: "user", content: messageContent });
      // Keep only last 10 messages
      if (state.history.length > 10) {
        state.history = state.history.slice(-10);
      }

      const aiReply = await callAI([systemPrompt, ...state.history]);
      state.history.push({ role: "assistant", content: aiReply });

      await sendWhatsApp(phoneClean, aiReply);
      await notifyAdmins(supabase, phoneClean, messageContent);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("uazapi-webhook error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function notifyAdmins(
  supabase: ReturnType<typeof createClient>,
  phone: string,
  message: string
) {
  try {
    const clientePhone = phone.slice(-8);
    const { data: clienteMatch } = await supabase
      .from("clientes")
      .select("id, nome")
      .or(`telefone.ilike.%${clientePhone}%`)
      .limit(1)
      .maybeSingle();

    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const nome = clienteMatch?.nome || phone;
    for (const admin of adminRoles || []) {
      await supabase.from("notificacoes").insert({
        user_id: admin.user_id,
        titulo: "💬 Mensagem WhatsApp",
        mensagem: `${nome} enviou: "${message.slice(0, 100)}"`,
        tipo: "whatsapp_recebido",
        dados: {
          cliente_id: clienteMatch?.id || null,
          cliente_nome: nome,
          telefone: phone,
          mensagem_preview: message.slice(0, 200),
          dedup_key: `whatsapp_${phone}_${Date.now()}`,
        },
      });
    }
  } catch (e) {
    console.warn("notifyAdmins error:", e);
  }
}
