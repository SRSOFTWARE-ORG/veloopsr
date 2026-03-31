import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDateOnly(d: Date): string {
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

function generateProjectedDates(dataInicio: string, dataFim: string, frequencia: string): string[] {
  const start = new Date(`${dataInicio}T00:00:00.000Z`);
  const end = new Date(`${dataFim}T00:00:00.000Z`);
  const dates: string[] = [];
  let current = new Date(start);
  while (current <= end) {
    dates.push(formatDateOnly(current));
    if (frequencia === "semana") current = new Date(current.getTime() + 7 * DAY_MS);
    else if (frequencia === "quinzena") current = new Date(current.getTime() + 15 * DAY_MS);
    else current = addMonthsPreservingDay(current, 1);
  }
  return dates;
}

const diasSemana: Record<number, string> = {
  0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb",
};

// ── Enviar WhatsApp via UAZAPI ──
async function sendWhatsApp(phone: string, message: string): Promise<boolean> {
  const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
  const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");

  if (!UAZAPI_URL || !UAZAPI_TOKEN) {
    console.warn("[UAZAPI] Credenciais não configuradas");
    return false;
  }

  let cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.startsWith("0")) cleanPhone = cleanPhone.slice(1);
  if (!cleanPhone.startsWith("55")) cleanPhone = "55" + cleanPhone;

  try {
    const apiUrl = UAZAPI_URL.replace(/\/+$/, "");
    const res = await fetch(`${apiUrl}/message/send-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "token": UAZAPI_TOKEN },
      body: JSON.stringify({ phone: cleanPhone, message }),
    });
    const result = await res.json();
    if (!res.ok || result.error) {
      console.error("[UAZAPI] Falha:", res.status, result.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[UAZAPI] Network error:", err);
    return false;
  }
}

// ── Webhook para n8n (complementar) ──
async function sendWebhook(payload: Record<string, unknown>): Promise<boolean> {
  const webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
  if (!webhookUrl) return false;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, timestamp: new Date().toISOString(), source: "veloop" }),
    });
    return res.ok;
  } catch (err) {
    console.error("[Webhook] Network error:", err);
    return false;
  }
}

// ── Web Push ──
async function sendWebPush(subscription: { endpoint: string; p256dh: string; auth: string }, payload: object) {
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!vapidPublicKey || !vapidPrivateKey) return;
  try {
    const { default: webpush } = await import("npm:web-push@3.6.7");
    webpush.setVapidDetails("mailto:admin@veloop.app", vapidPublicKey, vapidPrivateKey);
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload)
    );
  } catch (err) {
    console.error("Push failed:", subscription.endpoint, err);
  }
}

// ── IA: gerar mensagem removida — agora via webhook/n8n ──

// ── Notificação interna (push + banco) ──
async function createNotification(
  supabase: any,
  userId: string,
  titulo: string,
  mensagem: string,
  tipo: string,
  dados: Record<string, any>,
  dedupKey: string
) {
  const { data: existing } = await supabase
    .from("notificacoes")
    .select("id")
    .eq("user_id", userId)
    .eq("tipo", tipo)
    .contains("dados", { dedup_key: dedupKey })
    .maybeSingle();

  if (existing) return false;

  await supabase.from("notificacoes").insert({
    user_id: userId,
    titulo,
    mensagem,
    tipo,
    dados: { ...dados, dedup_key: dedupKey },
  });

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  for (const sub of subs || []) {
    await sendWebPush(sub, { titulo, mensagem, tag: dedupKey });
  }

  return true;
}

// ── MAIN ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const currentHour = now.getUTCHours() - 3; // BRT = UTC-3
    const todayStr = formatDateOnly(now);
    const tomorrow = new Date(now.getTime() + DAY_MS);
    const tomorrowStr = formatDateOnly(tomorrow);

    // ── Verificar horário >= 08:00 BRT ──
    if (currentHour < 8) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "Fora do horário (antes das 08:00 BRT)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Buscar cobranças com dados de cliente ──
    const { data: cobrancas, error: cobErr } = await supabase
      .from("cobrancas")
      .select("id, cliente_id, cliente_nome, valor_parcela, data_inicio, data_fim, frequencia, criado_por");
    if (cobErr) throw cobErr;

    const clienteIds = [...new Set((cobrancas || []).map((c: any) => c.cliente_id))];
    const { data: clientesData } = await supabase
      .from("clientes")
      .select("id, telefone, cpf, nome")
      .in("id", clienteIds);

    const clienteMap = new Map<string, { telefone: string; cpf: string; nome: string }>();
    for (const cl of clientesData || []) {
      clienteMap.set(cl.id, { telefone: cl.telefone || "", cpf: cl.cpf || "", nome: cl.nome });
    }

    // ── Buscar pagamentos (status) ──
    const { data: pagamentos } = await supabase
      .from("cobranca_pagamentos")
      .select("cobranca_id, data_vencimento, status");

    const statusMap = new Map<string, string>();
    for (const p of pagamentos || []) {
      statusMap.set(`${p.cobranca_id}_${p.data_vencimento}`, p.status);
    }

    // ── Buscar envios já feitos HOJE (dedup) ──
    const { data: enviosHoje } = await supabase
      .from("envio_cobranca")
      .select("cpf")
      .eq("data_envio", todayStr);

    const cpfsJaEnviados = new Set((enviosHoje || []).map((e: any) => e.cpf));

    // ── Buscar admins ──
    const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const adminIds = adminRoles?.map((r: any) => r.user_id) || [];

    // ── Processar cada cobrança ──
    const formatValor = (v: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

    interface ProcessEntry {
      cobrancaId: string;
      clienteId: string;
      clienteNome: string;
      valorParcela: number;
      criadoPor: string;
      date: string;
      tipo: "D-1" | "D0";
    }

    const entriesToProcess: ProcessEntry[] = [];

    for (const cob of cobrancas || []) {
      const dates = generateProjectedDates(cob.data_inicio, cob.data_fim, cob.frequencia);
      for (const date of dates) {
        const key = `${cob.id}_${date}`;
        const status = statusMap.get(key) || "a_pagar";

        // REGRA CRÍTICA: nunca enviar para pago ou isento
        if (status === "pago" || status === "isento") continue;

        let tipo: "D-1" | "D0" | null = null;
        if (date === tomorrowStr) tipo = "D-1";
        else if (date === todayStr) tipo = "D0";

        if (!tipo) continue;

        entriesToProcess.push({
          cobrancaId: cob.id,
          clienteId: cob.cliente_id,
          clienteNome: cob.cliente_nome,
          valorParcela: cob.valor_parcela,
          criadoPor: cob.criado_por,
          date,
          tipo,
        });
      }
    }

    let whatsappCount = 0;
    let notifCount = 0;
    let skippedDuplicates = 0;

    for (const entry of entriesToProcess) {
      const cliente = clienteMap.get(entry.clienteId);
      if (!cliente) continue;

      const cpf = cliente.cpf;
      const telefone = cliente.telefone;
      const nomeCompleto = cliente.nome || entry.clienteNome;

      // ── DEDUP: já enviou para esse CPF hoje? ──
      if (cpf && cpfsJaEnviados.has(cpf)) {
        skippedDuplicates++;
        continue;
      }

      if (!telefone || !cpf) continue;

      const valorFormatado = formatValor(entry.valorParcela);
      const statusAtual = statusMap.get(`${entry.cobrancaId}_${entry.date}`) || "a_pagar";

      // ── Enviar via Webhook (n8n) ──
      const enviado = await sendWebhook({
        nome_cliente: nomeCompleto,
        telefone,
        valor_transacao: entry.valorParcela,
        data_vencimento: entry.date,
        tipo: "cobranca",
        cobranca_id: entry.cobrancaId,
        cliente_id: entry.clienteId,
        cpf,
        status_parcela: statusAtual,
        tipo_envio: entry.tipo,
      });

      // ── Registrar no banco (SEMPRE, sucesso ou falha) ──
      try {
        await supabase.from("envio_cobranca").insert({
          cobranca_id: entry.cobrancaId,
          cliente_id: entry.clienteId,
          cpf,
          telefone,
          data_envio: todayStr,
          tipo_envio: entry.tipo,
          status_fatura: statusAtual,
          mensagem: `Webhook ${entry.tipo} — ${valorFormatado}`,
          enviado_com_sucesso: enviado,
        });
        cpfsJaEnviados.add(cpf);
      } catch (insertErr) {
        console.warn("Insert envio_cobranca falhou (possível duplicata):", insertErr);
      }

      if (enviado) whatsappCount++;

      // ── Notificação interna para vendedor + admins ──
      const tipoLabel = entry.tipo === "D-1" ? "Amanhã" : "Hoje";
      const emoji = entry.tipo === "D-1" ? "🔔" : "📌";
      const usersToNotify = new Set([entry.criadoPor, ...adminIds]);

      for (const userId of usersToNotify) {
        const ok = await createNotification(
          supabase,
          userId,
          `${emoji} Cobrança ${tipoLabel}`,
          `Cobrar ${entry.clienteNome} ${tipoLabel.toLowerCase()} — ${valorFormatado}`,
          entry.tipo === "D-1" ? "lembrete_amanha" : "lembrete_hoje",
          { cobranca_id: entry.cobrancaId, cliente_nome: entry.clienteNome, data: entry.date },
          `${entry.tipo === "D-1" ? "amanha" : "hoje"}_${entry.cobrancaId}_${entry.date}`
        );
        if (ok) notifCount++;
      }
    }

    // ── Resumo semanal (segundas-feiras) ──
    const dayOfWeek = now.getUTCDay();
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    const endOfWeek = new Date(now.getTime() + daysUntilSunday * DAY_MS);
    const endOfWeekStr = formatDateOnly(endOfWeek);

    if (dayOfWeek === 1) {
      const weekEntries: Map<string, string[]> = new Map();
      for (const cob of cobrancas || []) {
        const dates = generateProjectedDates(cob.data_inicio, cob.data_fim, cob.frequencia);
        for (const date of dates) {
          const status = statusMap.get(`${cob.id}_${date}`) || "a_pagar";
          if (status === "pago" || status === "isento") continue;
          if (date >= todayStr && date <= endOfWeekStr) {
            if (!weekEntries.has(date)) weekEntries.set(date, []);
            weekEntries.get(date)!.push(cob.cliente_nome);
          }
        }
      }

      const totalWeek = Array.from(weekEntries.values()).flat().length;
      if (totalWeek > 0) {
        const weekDays: string[] = [];
        for (const date of Array.from(weekEntries.keys()).sort()) {
          const d = new Date(`${date}T00:00:00.000Z`);
          const dayName = diasSemana[d.getUTCDay()];
          weekDays.push(`${dayName}: ${weekEntries.get(date)!.join(", ")}`);
        }

        const mensagem = `Essa semana tem ${totalWeek} cobrança${totalWeek > 1 ? "s" : ""} — ${weekDays.join(" · ")}`;
        const allCreators = new Set((cobrancas || []).map((c: any) => c.criado_por));
        const usersToNotify = new Set([...allCreators, ...adminIds]);

        for (const userId of usersToNotify) {
          await createNotification(
            supabase, userId,
            "📅 Resumo da Semana",
            mensagem,
            "resumo_semanal",
            { semana: todayStr, total: totalWeek },
            `semana_${todayStr}`
          );
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        webhooks_sent: whatsappCount,
        notifications_created: notifCount,
        skipped_duplicates: skippedDuplicates,
        entries_processed: entriesToProcess.length,
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
