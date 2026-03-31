import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BOT_PREFIX = "🤖 [Assistente Virtual Veloop]\n\n";
const ADMIN_ONLINE_WINDOW_MS = 10 * 60 * 1000;
const adminActivity = new Map<string, number>();

const HUMAN_KEYWORDS = ["atendente", "humano", "pessoa", "suporte"];
const INVOICE_KEYWORDS = [
  "fatura", "parcela", "boleto", "pagamento", "pagar", "vencimento",
  "quanto devo", "minha conta", "pendente", "cobrança", "cobranças",
  "próxima parcela", "próximo pagamento", "dívida", "débito",
];

// ─── Helpers ───

function isAdminOnline(phone: string): boolean {
  const last = adminActivity.get(phone);
  return !!last && Date.now() - last < ADMIN_ONLINE_WINDOW_MS;
}

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(d: string) {
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

// ─── AI: Gemini (primary) + Groq (fallback) ───

async function callGemini(messages: Array<{ role: string; content: string }>): Promise<string | null> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return null;
  try {
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    // Gemini expects system instruction separately
    const systemIdx = messages.findIndex((m) => m.role === "system");
    let systemInstruction: any = undefined;
    if (systemIdx >= 0) {
      systemInstruction = { parts: [{ text: messages[systemIdx].content }] };
      contents.splice(systemIdx, 1);
    }
    const body: any = { contents };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    if (res.status === 429) { console.warn("[Gemini] rate limited"); return null; }
    if (!res.ok) { console.error("[Gemini] error:", res.status); return null; }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) { console.error("[Gemini] exception:", e); return null; }
}

async function callGroq(messages: Array<{ role: string; content: string }>): Promise<string | null> {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "llama3-8b-8192", messages }),
    });
    if (!res.ok) { console.error("[Groq] error:", res.status); return null; }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (e) { console.error("[Groq] exception:", e); return null; }
}

async function callAI(messages: Array<{ role: string; content: string }>): Promise<string> {
  // Try Gemini first, fallback to Groq, then Lovable AI
  let reply = await callGemini(messages);
  if (reply) { console.log("[AI] Gemini responded"); return reply; }

  reply = await callGroq(messages);
  if (reply) { console.log("[AI] Groq fallback responded"); return reply; }

  // Ultimate fallback: Lovable AI
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey) {
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-2.5-flash-lite", messages }),
      });
      if (res.ok) {
        const data = await res.json();
        reply = data.choices?.[0]?.message?.content;
        if (reply) { console.log("[AI] Lovable fallback responded"); return reply; }
      }
    } catch (e) { console.error("[Lovable AI] error:", e); }
  }

  return "Desculpe, o assistente está temporariamente indisponível. Tente novamente em instantes.";
}

// ─── UAZAPI send ───

async function sendWhatsApp(phone: string, message: string) {
  const url = Deno.env.get("UAZAPI_URL");
  const token = Deno.env.get("UAZAPI_TOKEN");
  if (!url || !token) { console.error("UAZAPI not configured"); return false; }
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ number: phone, text: message, linkPreview: false }),
    });
    await res.text();
    return res.ok;
  } catch (e) { console.error("sendWhatsApp error:", e); return false; }
}

// ─── Conversation DB helpers ───

async function getOrCreateConversation(supabase: any, phone: string) {
  const { data } = await supabase.from("conversations").select("*").eq("phone", phone).maybeSingle();
  if (data) return data;
  const { data: created } = await supabase.from("conversations")
    .insert({ phone, status: "auto", stage: "idle" }).select().single();
  return created;
}

async function updateConversation(supabase: any, phone: string, updates: any) {
  await supabase.from("conversations").update({ ...updates, updated_at: new Date().toISOString() }).eq("phone", phone);
}

async function saveMessage(supabase: any, conversationId: string, role: string, content: string) {
  await supabase.from("messages").insert({ conversation_id: conversationId, role, content });
}

async function getHistory(supabase: any, conversationId: string, limit = 5) {
  const { data } = await supabase.from("messages").select("role, content")
    .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(limit);
  return (data || []).reverse();
}

// ─── Notify admins ───

async function notifyAdmins(supabase: any, phone: string, message: string) {
  try {
    const last8 = phone.slice(-8);
    const { data: cliente } = await supabase.from("clientes").select("id, nome")
      .or(`telefone.ilike.%${last8}%`).limit(1).maybeSingle();
    const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const nome = cliente?.nome || phone;
    for (const admin of admins || []) {
      await supabase.from("notificacoes").insert({
        user_id: admin.user_id,
        titulo: "💬 Mensagem WhatsApp",
        mensagem: `${nome} enviou: "${message.slice(0, 100)}"`,
        tipo: "whatsapp_recebido",
        dados: { cliente_id: cliente?.id || null, cliente_nome: nome, telefone: phone, mensagem_preview: message.slice(0, 200) },
      });
    }
  } catch (e) { console.warn("notifyAdmins error:", e); }
}

// ─── Main handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Log raw body to diagnose UAZAPI payload structure
    console.log("[Webhook] RAW BODY:", JSON.stringify(body).slice(0, 4000));

    // UAZAPI can send different structures (Evolution-style, Go v2, custom wrappers)
    const rawEvent = body.event || body.type || body.action || body.EventType || body.eventType || body.data?.event || "unknown";
    const rawEventString = typeof rawEvent === "string"
      ? rawEvent
      : String(rawEvent?.event || rawEvent?.type || rawEvent?.EventType || "unknown");

    const normalizedEvent = rawEventString.toLowerCase();
    const event = (
      normalizedEvent === "messages" ||
      normalizedEvent === "message" ||
      normalizedEvent === "messages.upsert" ||
      normalizedEvent === "message.upsert"
    ) ? "messages.upsert" : rawEventString;

    // Sender (JID) can come from different places
    const sender = body.data?.key?.remoteJid
      || body.body?.key?.remoteJid
      || body.key?.remoteJid
      || body.message?.chatid
      || body.chat?.wa_chatid
      || body.sender
      || body.from
      || body.remoteJid
      || (body.chat?.phone ? `${String(body.chat.phone).replace(/\D/g, "")}@s.whatsapp.net` : null)
      || null;

    // Message text can also come in multiple paths
    const rawMessageContent = body.data?.message?.conversation
      || body.data?.message?.extendedTextMessage?.text
      || body.body?.message?.conversation
      || body.body?.message?.extendedTextMessage?.text
      || body.message?.conversation
      || body.message?.extendedTextMessage?.text
      || body.message?.content
      || (typeof body.message === "string" ? body.message : null)
      || body.text
      || body.content
      || body.chat?.wa_lastMessageTextVote
      || null;

    const extractedObjectText = rawMessageContent && typeof rawMessageContent === "object"
      ? (
        (rawMessageContent as Record<string, unknown>).text
        ?? (rawMessageContent as Record<string, unknown>).content
        ?? (rawMessageContent as Record<string, unknown>).body
        ?? (rawMessageContent as Record<string, unknown>).caption
      )
      : null;

    const messageContent = typeof rawMessageContent === "string"
      ? rawMessageContent.trim()
      : (typeof extractedObjectText === "string" ? extractedObjectText.trim() : null);

    const fromMeRaw = body.data?.key?.fromMe
      ?? body.body?.key?.fromMe
      ?? body.key?.fromMe
      ?? body.message?.fromMe
      ?? body.message?.from_me
      ?? body.fromMe
      ?? false;
    const fromMe = fromMeRaw === true || fromMeRaw === "true" || fromMeRaw === 1 || fromMeRaw === "1";

    const wasSentByApiRaw = body.data?.key?.wasSentByApi
      ?? body.data?.wasSentByApi
      ?? body.body?.key?.wasSentByApi
      ?? body.message?.wasSentByApi
      ?? body.message?.fromApi
      ?? body.message?.from_api
      ?? body.wasSentByApi
      ?? false;
    const wasSentByApi = wasSentByApiRaw === true || wasSentByApiRaw === "true" || wasSentByApiRaw === 1 || wasSentByApiRaw === "1";

    const messagePreview = messageContent
      ? messageContent.slice(0, 80)
      : rawMessageContent
        ? JSON.stringify(rawMessageContent).slice(0, 80)
        : "undefined";

    console.log(`[Webhook] Event: ${event}, From: ${sender}, FromMe: ${fromMe}, API: ${wasSentByApi}, Msg: ${messagePreview}`);

    // Audit log
    await supabase.from("audit_log").insert({
      tabela: "whatsapp_uazapi", acao: "webhook_recebido",
      detalhes: { event, sender: sender?.replace(/\d(?=\d{4})/g, "*"), from_me: fromMe, api_sent: wasSentByApi, timestamp: new Date().toISOString() },
    });

    // Forward to n8n
    const n8nUrl = Deno.env.get("N8N_WEBHOOK_URL");
    if (n8nUrl && !n8nUrl.includes("localhost")) {
      fetch(n8nUrl, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "uazapi_incoming", event, sender, message: messageContent, raw: body, timestamp: new Date().toISOString() }),
      }).catch((e) => console.warn("[n8n] error:", e));
    }

    // Track admin activity
    if (event === "messages.upsert" && sender && fromMe) {
      const phone = sender.replace("@s.whatsapp.net", "").replace(/\D/g, "");
      adminActivity.set(phone, Date.now());
    }

    // Process incoming private messages only
    if (event !== "messages.upsert" || !sender || !messageContent || fromMe) {
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── ANTI-LOOP: Ignore API-sent messages ───
    if (wasSentByApi) {
      console.log("[Bot] Ignoring API-sent message (anti-loop)");
      return new Response(JSON.stringify({ success: true, skipped: "api_sent" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Ignore groups
    if (sender.endsWith("@g.us")) {
      return new Response(JSON.stringify({ success: true, skipped: "group" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const phone = sender.replace("@s.whatsapp.net", "").replace(/\D/g, "");

    // Admin online check
    if (isAdminOnline(phone)) {
      await notifyAdmins(supabase, phone, messageContent);
      return new Response(JSON.stringify({ success: true, bot_skipped: "admin_online" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get/create conversation
    const conv = await getOrCreateConversation(supabase, phone);
    if (!conv) {
      console.error("[Bot] Failed to create conversation");
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── MANUAL MODE: Block bot responses ───
    if (conv.status === "manual") {
      console.log(`[Bot] Conversation ${phone} is in manual mode, bot silent`);
      await saveMessage(supabase, conv.id, "user", messageContent);
      await notifyAdmins(supabase, phone, messageContent);
      return new Response(JSON.stringify({ success: true, bot_skipped: "manual_mode" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const msgLower = messageContent.trim().toLowerCase();

    // ─── HUMAN HANDOFF CHECK ───
    if (HUMAN_KEYWORDS.some((kw) => msgLower.includes(kw))) {
      await updateConversation(supabase, phone, { status: "manual" });
      const reply = BOT_PREFIX + "Entendido! 🙋 Estou transferindo você para o nosso suporte humano.\n\nUm atendente entrará em contato em breve. Aguarde, por favor!";
      await sendWhatsApp(phone, reply);
      await saveMessage(supabase, conv.id, "user", messageContent);
      await saveMessage(supabase, conv.id, "assistant", reply);
      await notifyAdmins(supabase, phone, messageContent);
      return new Response(JSON.stringify({ success: true, action: "handoff" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── AWAITING CPF ───
    if (conv.stage === "awaiting_cpf") {
      const cpfDigits = messageContent.replace(/\D/g, "");
      if (cpfDigits.length === 11 || cpfDigits.length === 14) {
        let { data: cliente } = await supabase.from("clientes").select("id, nome, cpf").eq("cpf", messageContent.trim()).maybeSingle();
        if (!cliente) {
          const { data: c2 } = await supabase.from("clientes").select("id, nome, cpf").ilike("cpf", `%${cpfDigits}%`).limit(1).maybeSingle();
          cliente = c2;
        }

        let reply: string;
        if (!cliente) {
          reply = BOT_PREFIX + "❌ Não encontrei nenhum cliente com esse CPF.\n\nVerifique se digitou corretamente ou entre em contato com a loja.";
        } else {
          const { data: cobrancas } = await supabase.from("cobrancas").select("id, valor_parcela, cliente_nome").eq("cliente_id", cliente.id);
          if (cobrancas?.length) {
            const { data: parcelas } = await supabase.from("cobranca_pagamentos").select("id, cobranca_id, data_vencimento, status")
              .in("cobranca_id", cobrancas.map((c: any) => c.id)).in("status", ["a_pagar", "pendente"]).order("data_vencimento", { ascending: true }).limit(5);
            if (parcelas?.length) {
              const cobMap = new Map(cobrancas.map((c: any) => [c.id, c]));
              const lines = parcelas.map((p: any) => {
                const cob = cobMap.get(p.cobranca_id);
                return `• ${p.status === "pendente" ? "⚠️ ATRASADA" : "📅 A pagar"} — Venc: ${formatDate(p.data_vencimento)} — ${cob ? formatCurrency(cob.valor_parcela) : "N/A"}`;
              });
              reply = BOT_PREFIX + `Olá, *${cliente.nome}*! 👋\n\nSuas próximas parcelas:\n\n${lines.join("\n")}\n\nQualquer dúvida, é só perguntar! 😊`;
            } else {
              reply = BOT_PREFIX + `Olá, *${cliente.nome}*! 👋\n\n✅ Sem parcelas pendentes. Tudo em dia!`;
            }
          } else {
            reply = BOT_PREFIX + `Olá, *${cliente.nome}*! 👋\n\nNão encontrei cobranças no seu cadastro.\nEntre em contato com a loja para mais informações.`;
          }
        }
        await updateConversation(supabase, phone, { stage: "idle" });
        await sendWhatsApp(phone, reply);
        await saveMessage(supabase, conv.id, "user", messageContent);
        await saveMessage(supabase, conv.id, "assistant", reply);
      } else {
        const reply = BOT_PREFIX + "Por favor, envie seu *CPF* com 11 dígitos (ou CNPJ com 14).\n\nExemplo: 123.456.789-00";
        await sendWhatsApp(phone, reply);
      }
      await notifyAdmins(supabase, phone, messageContent);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── INVOICE QUERY ───
    if (INVOICE_KEYWORDS.some((kw) => msgLower.includes(kw))) {
      await updateConversation(supabase, phone, { stage: "awaiting_cpf" });
      const reply = BOT_PREFIX + "Para consultar suas parcelas, preciso do seu *CPF*. 📋\n\nPor favor, envie seu CPF:";
      await sendWhatsApp(phone, reply);
      await saveMessage(supabase, conv.id, "user", messageContent);
      await saveMessage(supabase, conv.id, "assistant", reply);
      await notifyAdmins(supabase, phone, messageContent);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── GENERAL AI CONVERSATION ───
    await saveMessage(supabase, conv.id, "user", messageContent);
    const history = await getHistory(supabase, conv.id, 5);

    const systemPrompt = {
      role: "system",
      content:
        "Você é o Assistente Virtual Veloop da SR SOFTWARE, empresa de tecnologia e gestão inteligente. " +
        "A SR SOFTWARE é liderada pelo CEO Silvio Rodrigues da Cruz Junior. " +
        "Seu tom é ágil, profissional, cordial e objetivo — focado em logística, motoristas e entregas. " +
        "NUNCA inclua o prefixo '🤖 [Assistente Virtual Veloop]' na sua resposta — ele é adicionado automaticamente. " +
        "Se o cliente perguntar sobre faturas, parcelas, pagamentos ou boletos, peça o CPF dele. " +
        "Responda em português brasileiro. Mantenha respostas curtas para WhatsApp (use *negrito* e emojis). " +
        "Se não souber algo, sugira contato direto com a SR SOFTWARE.",
    };

    const aiReply = await callAI([systemPrompt, ...history]);
    const fullReply = BOT_PREFIX + aiReply;
    await sendWhatsApp(phone, fullReply);
    await saveMessage(supabase, conv.id, "assistant", fullReply);
    await notifyAdmins(supabase, phone, messageContent);

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("uazapi-webhook error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
