import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BOT_PREFIX = "✨ *Assistente SR* ✨\n\n";
const ADMIN_ONLINE_WINDOW_MS = 10 * 60 * 1000;
const ADMIN_PHONE = "5527999177265";
const adminActivity = new Map<string, number>();

const processedMessages = new Map<string, number>();
const DEDUP_TTL_MS = 60 * 1000;

function isDuplicate(messageId: string): boolean {
  const now = Date.now();
  for (const [id, ts] of processedMessages) {
    if (now - ts > DEDUP_TTL_MS) processedMessages.delete(id);
  }
  if (processedMessages.has(messageId)) return true;
  processedMessages.set(messageId, now);
  return false;
}

const HUMAN_KEYWORDS = ["atendente", "humano", "pessoa", "suporte"];

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

// ─── AI: Gemini ───

async function callAI(messages: Array<{ role: string; content: string }>): Promise<string> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return "Desculpe, o assistente está temporariamente indisponível.";
  try {
    const contents: any[] = [];
    let systemInstruction: any = undefined;
    for (const m of messages) {
      if (m.role === "system") {
        systemInstruction = { parts: [{ text: m.content }] };
      } else {
        contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] });
      }
    }
    const body: any = { contents };
    if (systemInstruction) body.systemInstruction = systemInstruction;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    if (!res.ok) { console.error("[Gemini] error:", res.status, await res.text()); return "Desculpe, não consegui processar sua mensagem agora."; }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, não consegui gerar uma resposta.";
  } catch (e) { console.error("[Gemini] exception:", e); return "Desculpe, ocorreu um erro. Tente novamente."; }
}

// ─── UAZAPI send ───

async function sendWhatsApp(phone: string, message: string) {
  const url = Deno.env.get("UAZAPI_URL");
  const token = Deno.env.get("UAZAPI_TOKEN");
  if (!url || !token) return false;
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

// ─── Download media from UAZAPI ───

async function downloadMediaBase64(messageBody: any): Promise<string | null> {
  const url = Deno.env.get("UAZAPI_URL");
  const token = Deno.env.get("UAZAPI_TOKEN");
  if (!url || !token) return null;
  try {
    const payload = messageBody.data || messageBody.body || messageBody;
    const res = await fetch(`${url.replace(/\/+$/, "")}/chat/getBase64FromMediaMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ message: payload }),
    });
    if (!res.ok) { console.error("[downloadMedia] status:", res.status); return null; }
    const data = await res.json();
    return data.base64 || data.data || null;
  } catch (e) { console.error("downloadMedia error:", e); return null; }
}

// ─── Transcribe audio with Gemini ───

async function transcribeAudio(audioBase64: string, mimeType: string = "audio/ogg"): Promise<string> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return "";
  try {
    const cleanBase64 = audioBase64.includes(",") ? audioBase64.split(",")[1] : audioBase64;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType, data: cleanBase64 } },
              { text: "Transcreva este áudio em português brasileiro. Retorne APENAS o texto transcrito, sem explicações." }
            ]
          }]
        }),
      }
    );
    if (!res.ok) { console.error("[Gemini STT] error:", res.status, await res.text()); return ""; }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  } catch (e) { console.error("transcribeAudio error:", e); return ""; }
}

// ─── Text to Speech (Google Translate TTS - free) ───

async function textToSpeechBase64(text: string): Promise<string | null> {
  try {
    const clean = text.replace(/[*_~`✨\n]/g, " ").replace(/Assistente SR/g, "").replace(/\s+/g, " ").trim();
    const shortText = clean.slice(0, 200);
    if (!shortText) return null;
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(shortText)}&tl=pt-BR&client=tw-ob&ttsspeed=1`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } });
    if (!res.ok) { console.error("[TTS] status:", res.status); return null; }
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  } catch (e) { console.error("textToSpeech error:", e); return null; }
}

// ─── Send audio via UAZAPI (PTT voice message) ───

async function sendWhatsAppAudio(phone: string, audioBase64: string): Promise<boolean> {
  const url = Deno.env.get("UAZAPI_URL");
  const token = Deno.env.get("UAZAPI_TOKEN");
  if (!url || !token) return false;
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/send/audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ number: phone, audio: `data:audio/mp3;base64,${audioBase64}`, ptt: true }),
    });
    if (!res.ok) console.error("[sendAudio] status:", res.status, await res.text());
    return res.ok;
  } catch (e) { console.error("sendWhatsAppAudio error:", e); return false; }
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

async function getHistory(supabase: any, conversationId: string, limit = 10) {
  const { data } = await supabase.from("messages").select("role, content")
    .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(limit);
  return (data || []).reverse();
}

// ─── Notify admins (in-app) ───

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

// ─── CPF lookup (with or without punctuation) ───

async function lookupClienteByCpf(supabase: any, rawCpf: string) {
  const digits = rawCpf.replace(/\D/g, "");
  if (digits.length !== 11 && digits.length !== 14) return null;
  const { data: c1 } = await supabase.from("clientes").select("id, nome, cpf").eq("cpf", rawCpf.trim()).maybeSingle();
  if (c1) return c1;
  if (digits.length === 11) {
    const formatted = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
    const { data: c2 } = await supabase.from("clientes").select("id, nome, cpf").eq("cpf", formatted).maybeSingle();
    if (c2) return c2;
  }
  const { data: c3 } = await supabase.from("clientes").select("id, nome, cpf").eq("cpf", digits).maybeSingle();
  if (c3) return c3;
  const { data: c4 } = await supabase.from("clientes").select("id, nome, cpf").ilike("cpf", `%${digits}%`).limit(1).maybeSingle();
  return c4 || null;
}

// ─── Fetch pending invoices for a client ───

async function fetchPendingInvoices(supabase: any, clienteId: string) {
  const { data: cobrancas } = await supabase.from("cobrancas").select("id, valor_parcela, cliente_nome").eq("cliente_id", clienteId);
  if (!cobrancas?.length) return { text: "Não encontrei cobranças no seu cadastro.", parcelas: [] };

  const { data: parcelas } = await supabase.from("cobranca_pagamentos").select("id, cobranca_id, data_vencimento, status")
    .in("cobranca_id", cobrancas.map((c: any) => c.id)).in("status", ["a_pagar", "pendente"]).order("data_vencimento", { ascending: true }).limit(10);

  if (!parcelas?.length) return { text: "✅ Sem parcelas pendentes. Tudo em dia!", parcelas: [] };

  const cobMap = new Map(cobrancas.map((c: any) => [c.id, c]));
  const enriched = parcelas.map((p: any, i: number) => {
    const cob = cobMap.get(p.cobranca_id);
    return {
      index: i + 1,
      cobranca_id: p.cobranca_id,
      data_vencimento: p.data_vencimento,
      valor: cob?.valor_parcela || 0,
      status: p.status,
      label: `*${i + 1}.* ${p.status === "pendente" ? "⚠️ ATRASADA" : "📅 A pagar"} — Venc: ${formatDate(p.data_vencimento)} — ${cob ? formatCurrency(cob.valor_parcela) : "N/A"}`,
    };
  });

  const lines = enriched.map((e: any) => e.label);
  return { text: `Suas próximas parcelas:\n\n${lines.join("\n")}`, parcelas: enriched };
}

// ─── Generate PIX payment link ───

function generatePixLink(cobrancaId: string, dataVencimento: string, valor: number, clienteNome: string): string {
  const appUrl = "https://veloopsr.lovable.app";
  return `${appUrl}/pagar/${cobrancaId}/${dataVencimento}?valor=${valor}&cliente=${encodeURIComponent(clienteNome)}`;
}

// ─── Main handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    console.log("[Webhook] RAW BODY:", JSON.stringify(body).slice(0, 2000));

    const rawEvent = body.event || body.type || body.action || body.EventType || body.eventType || body.data?.event || "unknown";
    const rawEventString = typeof rawEvent === "string" ? rawEvent : String(rawEvent?.event || rawEvent?.type || "unknown");
    const normalizedEvent = rawEventString.toLowerCase();
    const event = (
      normalizedEvent === "messages" || normalizedEvent === "message" ||
      normalizedEvent === "messages.upsert" || normalizedEvent === "message.upsert"
    ) ? "messages.upsert" : rawEventString;

    const messageId = body.data?.key?.id || body.body?.key?.id || body.key?.id || body.message?.id || body.id || null;

    const sender = body.data?.key?.remoteJid || body.body?.key?.remoteJid || body.key?.remoteJid
      || body.message?.chatid || body.chat?.wa_chatid || body.sender || body.from || body.remoteJid
      || (body.chat?.phone ? `${String(body.chat.phone).replace(/\D/g, "")}@s.whatsapp.net` : null)
      || null;

    const rawMessageContent = body.data?.message?.conversation
      || body.data?.message?.extendedTextMessage?.text
      || body.body?.message?.conversation || body.body?.message?.extendedTextMessage?.text
      || body.message?.conversation || body.message?.extendedTextMessage?.text
      || body.message?.content || (typeof body.message === "string" ? body.message : null)
      || body.text || body.content || null;

    let messageContent = typeof rawMessageContent === "string" ? rawMessageContent.trim()
      : (rawMessageContent && typeof rawMessageContent === "object"
        ? String((rawMessageContent as any).text ?? (rawMessageContent as any).content ?? (rawMessageContent as any).body ?? "").trim()
        : null);

    // ─── AUDIO MESSAGE DETECTION ───
    const audioMessage = body.data?.message?.audioMessage
      || body.body?.message?.audioMessage
      || body.message?.audioMessage || null;
    let isAudioMessage = false;

    const fromMeRaw = body.data?.key?.fromMe ?? body.body?.key?.fromMe ?? body.key?.fromMe ?? body.message?.fromMe ?? body.fromMe ?? false;
    const fromMe = fromMeRaw === true || fromMeRaw === "true" || fromMeRaw === 1 || fromMeRaw === "1";

    const wasSentByApiRaw = body.data?.key?.wasSentByApi ?? body.data?.wasSentByApi ?? body.body?.key?.wasSentByApi
      ?? body.message?.wasSentByApi ?? body.message?.fromApi ?? body.wasSentByApi ?? false;
    const wasSentByApi = wasSentByApiRaw === true || wasSentByApiRaw === "true" || wasSentByApiRaw === 1 || wasSentByApiRaw === "1";

    // If audio message without text, try to transcribe
    if (!messageContent && audioMessage && !fromMe) {
      console.log("[Webhook] Audio message detected, attempting transcription...");
      const mimeType = audioMessage.mimetype || "audio/ogg";
      const audioBase64 = await downloadMediaBase64(body);
      if (audioBase64) {
        const transcription = await transcribeAudio(audioBase64, mimeType.split(";")[0]);
        if (transcription) {
          messageContent = transcription;
          isAudioMessage = true;
          console.log(`[Webhook] Audio transcribed: "${transcription.slice(0, 100)}"`);
        }
      }
    }

    console.log(`[Webhook] Event: ${event}, From: ${sender}, FromMe: ${fromMe}, API: ${wasSentByApi}, MsgID: ${messageId}, Audio: ${isAudioMessage}, Msg: ${messageContent?.slice(0, 80)}`);

    if (event === "messages.upsert" && sender && fromMe) {
      const phone = sender.replace("@s.whatsapp.net", "").replace(/\D/g, "");
      adminActivity.set(phone, Date.now());
    }

    if (event !== "messages.upsert" || !sender || !messageContent || fromMe) {
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (wasSentByApi) {
      return new Response(JSON.stringify({ success: true, skipped: "api_sent" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (sender.endsWith("@g.us")) {
      return new Response(JSON.stringify({ success: true, skipped: "group" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (messageId && isDuplicate(messageId)) {
      return new Response(JSON.stringify({ success: true, skipped: "duplicate" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const phone = sender.replace("@s.whatsapp.net", "").replace(/\D/g, "");

    if (isAdminOnline(phone)) {
      await notifyAdmins(supabase, phone, messageContent);
      return new Response(JSON.stringify({ success: true, bot_skipped: "admin_online" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const conv = await getOrCreateConversation(supabase, phone);
    if (!conv) {
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (conv.status === "manual") {
      await saveMessage(supabase, conv.id, "user", messageContent);
      await notifyAdmins(supabase, phone, messageContent);
      return new Response(JSON.stringify({ success: true, bot_skipped: "manual_mode" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const msgLower = messageContent.toLowerCase();

    // Human handoff
    if (HUMAN_KEYWORDS.some((kw) => msgLower.includes(kw))) {
      await updateConversation(supabase, phone, { status: "manual" });
      const reply = BOT_PREFIX + "Entendido! 🙋 Estou transferindo você para o nosso suporte humano.\n\nUm atendente entrará em contato em breve!";
      await sendWhatsApp(phone, reply);
      await saveMessage(supabase, conv.id, "user", messageContent);
      await saveMessage(supabase, conv.id, "assistant", reply);
      await notifyAdmins(supabase, phone, messageContent);
      return new Response(JSON.stringify({ success: true, action: "handoff" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── STAGE: AWAITING CPF (for payment or invoice lookup) ───
    if (conv.stage === "awaiting_cpf" || conv.stage === "awaiting_cpf_payment") {
      const cpfDigits = messageContent.replace(/\D/g, "");
      if (cpfDigits.length === 11 || cpfDigits.length === 14) {
        const cliente = await lookupClienteByCpf(supabase, messageContent);
        let reply: string;
        if (!cliente) {
          reply = BOT_PREFIX + "❌ Não encontrei nenhum cliente com esse CPF. Verifique e tente novamente.";
          await updateConversation(supabase, phone, { stage: "idle" });
        } else {
          const { text, parcelas } = await fetchPendingInvoices(supabase, cliente.id);
          if (conv.stage === "awaiting_cpf_payment" && parcelas.length > 0) {
            // Payment flow: show parcelas and ask which one to pay
            reply = BOT_PREFIX + `Olá, *${cliente.nome}*! 👋\n\n${text}\n\n💳 *Deseja pagar alguma dessas parcelas?*\nResponda com o *número* da parcela que deseja pagar (ex: *1*)\n\nOu digite *cancelar* para voltar.`;
            // Store client and parcelas data in conversation for next step
            await updateConversation(supabase, phone, {
              stage: "awaiting_payment_choice",
              // Store data as JSON string - we'll parse it back
            });
            // Save parcelas info in a message for context
            await saveMessage(supabase, conv.id, "system", JSON.stringify({ cliente_id: cliente.id, cliente_nome: cliente.nome, parcelas }));
          } else {
            reply = BOT_PREFIX + `Olá, *${cliente.nome}*! 👋\n\n${text}\n\n💡 _Se desejar pagar alguma parcela antecipadamente, basta digitar *pagar*._`;
            await updateConversation(supabase, phone, { stage: "idle" });
          }
        }
        await sendWhatsApp(phone, reply);
        await saveMessage(supabase, conv.id, "user", messageContent);
        await saveMessage(supabase, conv.id, "assistant", reply);
        await notifyAdmins(supabase, phone, messageContent);
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      await updateConversation(supabase, phone, { stage: "idle" });
    }

    // ─── STAGE: AWAITING PAYMENT CHOICE (user picks parcela number) ───
    if (conv.stage === "awaiting_payment_choice") {
      await saveMessage(supabase, conv.id, "user", messageContent);

      if (msgLower === "cancelar" || msgLower === "voltar" || msgLower === "não" || msgLower === "nao") {
        const reply = BOT_PREFIX + "Tudo bem! Cancelei o pagamento. Se precisar de algo, é só chamar! 😊\n\n💡 _Você pode pagar antecipadamente a qualquer momento digitando *pagar*._";
        await updateConversation(supabase, phone, { stage: "idle" });
        await sendWhatsApp(phone, reply);
        await saveMessage(supabase, conv.id, "assistant", reply);
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Get the last system message with parcelas data
      const { data: sysMessages } = await supabase.from("messages").select("content")
        .eq("conversation_id", conv.id).eq("role", "system").order("created_at", { ascending: false }).limit(1);

      let parcelasData: any = null;
      try { parcelasData = JSON.parse(sysMessages?.[0]?.content || "null"); } catch {}

      if (!parcelasData?.parcelas?.length) {
        const reply = BOT_PREFIX + "Ocorreu um erro ao recuperar suas parcelas. Por favor, digite *pagar* para reiniciar.";
        await updateConversation(supabase, phone, { stage: "idle" });
        await sendWhatsApp(phone, reply);
        await saveMessage(supabase, conv.id, "assistant", reply);
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const choiceNum = parseInt(messageContent.trim());
      const selected = parcelasData.parcelas.find((p: any) => p.index === choiceNum);

      if (!selected) {
        const reply = BOT_PREFIX + `❌ Número inválido. Escolha entre *1* e *${parcelasData.parcelas.length}*, ou digite *cancelar*.`;
        await sendWhatsApp(phone, reply);
        await saveMessage(supabase, conv.id, "assistant", reply);
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Show confirmation
      const reply = BOT_PREFIX + [
        `📋 *Confirmação de Pagamento*`,
        ``,
        `━━━━━━━━━━━━━━━━━━`,
        `👤 *Cliente:* ${parcelasData.cliente_nome}`,
        `📅 *Vencimento:* ${formatDate(selected.data_vencimento)}`,
        `💰 *Valor:* ${formatCurrency(selected.valor)}`,
        `━━━━━━━━━━━━━━━━━━`,
        ``,
        `Deseja confirmar o pagamento via *PIX*?`,
        ``,
        `Responda *sim* para gerar o PIX ou *não* para cancelar.`,
      ].join("\n");

      // Store selected parcela for confirmation
      await saveMessage(supabase, conv.id, "system", JSON.stringify({
        action: "confirm_payment",
        cliente_id: parcelasData.cliente_id,
        cliente_nome: parcelasData.cliente_nome,
        cobranca_id: selected.cobranca_id,
        data_vencimento: selected.data_vencimento,
        valor: selected.valor,
      }));
      await updateConversation(supabase, phone, { stage: "awaiting_payment_confirm" });
      await sendWhatsApp(phone, reply);
      await saveMessage(supabase, conv.id, "assistant", reply);
      await notifyAdmins(supabase, phone, messageContent);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── STAGE: AWAITING PAYMENT CONFIRMATION (sim/não) ───
    if (conv.stage === "awaiting_payment_confirm") {
      await saveMessage(supabase, conv.id, "user", messageContent);

      if (msgLower === "não" || msgLower === "nao" || msgLower === "cancelar" || msgLower === "n") {
        const reply = BOT_PREFIX + "Tudo bem! Pagamento cancelado. Se mudar de ideia, é só digitar *pagar*. 😊";
        await updateConversation(supabase, phone, { stage: "idle" });
        await sendWhatsApp(phone, reply);
        await saveMessage(supabase, conv.id, "assistant", reply);
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (msgLower === "sim" || msgLower === "s" || msgLower === "confirmar" || msgLower === "confirmo") {
        // Get confirmation data
        const { data: sysMessages } = await supabase.from("messages").select("content")
          .eq("conversation_id", conv.id).eq("role", "system").order("created_at", { ascending: false }).limit(1);

        let confirmData: any = null;
        try { confirmData = JSON.parse(sysMessages?.[0]?.content || "null"); } catch {}

        if (!confirmData?.action || confirmData.action !== "confirm_payment") {
          const reply = BOT_PREFIX + "Ocorreu um erro. Por favor, digite *pagar* para reiniciar.";
          await updateConversation(supabase, phone, { stage: "idle" });
          await sendWhatsApp(phone, reply);
          await saveMessage(supabase, conv.id, "assistant", reply);
          return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Generate PIX link
        const pixLink = generatePixLink(
          confirmData.cobranca_id,
          confirmData.data_vencimento,
          confirmData.valor,
          confirmData.cliente_nome
        );

        const reply = BOT_PREFIX + [
          `✅ *PIX Gerado com Sucesso!*`,
          ``,
          `💰 *Valor:* ${formatCurrency(confirmData.valor)}`,
          `📅 *Parcela:* ${formatDate(confirmData.data_vencimento)}`,
          ``,
          `━━━━━━━━━━━━━━━━━━`,
          `💳 *Clique no link abaixo para pagar:*`,
          ``,
          pixLink,
          ``,
          `━━━━━━━━━━━━━━━━━━`,
          ``,
          `📱 No link você encontra o *QR Code* e o *PIX Copia e Cola*.`,
          ``,
          `Após o pagamento, você receberá automaticamente:`,
          `✅ Confirmação do banco`,
          `📄 Comprovante SR Software em PDF`,
          ``,
          `_O pagamento será confirmado automaticamente!_ 🎉`,
        ].join("\n");

        await updateConversation(supabase, phone, { stage: "idle" });
        await sendWhatsApp(phone, reply);
        await saveMessage(supabase, conv.id, "assistant", reply);

        // Notify admin about payment initiation
        const adminMsg = [
          `💳 *Pagamento Antecipado Iniciado*`,
          ``,
          `👤 *Cliente:* ${confirmData.cliente_nome}`,
          `📅 *Parcela:* ${formatDate(confirmData.data_vencimento)}`,
          `💰 *Valor:* ${formatCurrency(confirmData.valor)}`,
          `📱 *Telefone:* ${phone}`,
          `🕐 *Hora:* ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
          ``,
          `O cliente abriu o link de pagamento PIX via bot.`,
        ].join("\n");
        await sendWhatsApp(ADMIN_PHONE, adminMsg);
        await notifyAdmins(supabase, phone, messageContent);
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Invalid response
      const reply = BOT_PREFIX + "Por favor, responda *sim* para confirmar ou *não* para cancelar.";
      await sendWhatsApp(phone, reply);
      await saveMessage(supabase, conv.id, "assistant", reply);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── DETECT "pagar" keyword to start payment flow ───
    const payKeywords = ["pagar", "pagamento", "pagar antecipado", "quero pagar", "pagar parcela"];
    if (payKeywords.some((kw) => msgLower.includes(kw)) && conv.stage === "idle") {
      const reply = BOT_PREFIX + "Claro! 💳 Para prosseguir com o pagamento, por favor me informe seu *CPF*:";
      await updateConversation(supabase, phone, { stage: "awaiting_cpf_payment" });
      await sendWhatsApp(phone, reply);
      await saveMessage(supabase, conv.id, "user", messageContent);
      await saveMessage(supabase, conv.id, "assistant", reply);
      await notifyAdmins(supabase, phone, messageContent);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── NATURAL AI CONVERSATION ───
    await saveMessage(supabase, conv.id, "user", messageContent);
    const history = await getHistory(supabase, conv.id, 10);

    const systemPrompt = {
      role: "system",
      content:
        "Você é o Assistente SR, assistente virtual da SR SOFTWARE, empresa de tecnologia e gestão inteligente. " +
        "A SR SOFTWARE é liderada pelo CEO Silvio Rodrigues da Cruz Junior. " +
        "Seu tom é cordial, amigável, profissional e acolhedor — como se fosse uma pessoa real conversando. " +
        "REGRA PRINCIPAL: Sempre que alguém mandar qualquer mensagem (seja 'oi', 'olá', 'bom dia', um emoji, ou qualquer coisa), " +
        "cumprimente cordialmente, apresente-se brevemente e pergunte como pode ajudar. Exemplo: " +
        "'Olá! 👋 Seja bem-vindo(a) à *SR SOFTWARE*! Sou o Assistente SR, como posso te ajudar hoje?' " +
        "Responda de forma natural e humana, sem parecer um robô. Use emojis com moderação e *negrito* quando necessário. " +
        "Mantenha respostas curtas e objetivas (ideal para WhatsApp). " +
        "NUNCA inclua prefixos como '🤖', '[Assistente]' ou similares — isso é adicionado automaticamente. " +
        "Se o cliente perguntar sobre faturas, parcelas, pagamentos ou boletos, peça o CPF dele de forma natural. " +
        "O CPF pode ser enviado com ou sem pontos e traço, ambos são aceitos. " +
        "IMPORTANTE: Em TODA resposta, inclua de forma sutil no final uma menção de que o cliente pode pagar parcelas antecipadamente " +
        "digitando a palavra *pagar*. Use variações naturais como: " +
        "'💡 _Sabia que você pode pagar parcelas antecipadas? Basta digitar *pagar*!_' ou " +
        "'💡 _Precisa pagar alguma parcela? Digite *pagar* e eu te ajudo!_'. " +
        "NÃO force o cliente a pagar, apenas mostre que é uma opção disponível. " +
        "Se não souber algo específico, sugira que entre em contato diretamente com a SR SOFTWARE. " +
        "Responda sempre em português brasileiro.",
    };

    const aiReply = await callAI([systemPrompt, ...history]);

    // If the AI asks for CPF, set conversation stage
    const cpfRelated = /cpf|cnpj/i.test(aiReply) && /envie|informe|digite|qual.*seu/i.test(aiReply);
    if (cpfRelated) {
      await updateConversation(supabase, phone, { stage: "awaiting_cpf" });
    }

    const fullReply = BOT_PREFIX + aiReply;
    await sendWhatsApp(phone, fullReply);
    await saveMessage(supabase, conv.id, "assistant", fullReply);

    // If incoming was audio, also respond with audio
    if (isAudioMessage) {
      const audioResponse = await textToSpeechBase64(aiReply);
      if (audioResponse) {
        await sendWhatsAppAudio(phone, audioResponse);
        console.log("[Webhook] Audio response sent to", phone);
      }
    }

    await notifyAdmins(supabase, phone, isAudioMessage ? `🎤 [Áudio]: ${messageContent}` : messageContent);

    // Forward to n8n
    const n8nUrl = Deno.env.get("N8N_WEBHOOK_URL");
    if (n8nUrl && !n8nUrl.includes("localhost")) {
      fetch(n8nUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "uazapi_incoming", event, sender, message: messageContent, timestamp: new Date().toISOString() }),
      }).catch((e) => console.warn("[n8n] error:", e));
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("uazapi-webhook error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
