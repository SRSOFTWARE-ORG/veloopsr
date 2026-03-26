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

async function sendWhatsApp(telefone: string, mensagem: string): Promise<boolean> {
  const apiUrl = Deno.env.get("EVOLUTION_API_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  if (!apiUrl || !apiKey || !telefone) return false;

  const digits = telefone.replace(/\D/g, "");
  const formattedPhone = digits.startsWith("55") && digits.length >= 12
    ? digits
    : `55${digits.startsWith("0") ? digits.slice(1) : digits}`;

  try {
    const res = await fetch(`${apiUrl}/message/sendText/Veloop`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: formattedPhone, text: mensagem }),
    });
    if (!res.ok) {
      console.error("WhatsApp send failed:", await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("WhatsApp network error:", err);
    return false;
  }
}

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

async function createNotification(
  supabase: any,
  userId: string,
  titulo: string,
  mensagem: string,
  tipo: string,
  dados: Record<string, any>,
  dedupKey: string
) {
  // Check for duplicate using dados.dedup_key
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

  // Send push
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  for (const sub of subs || []) {
    await sendWebPush(sub, { titulo, mensagem, tag: dedupKey });
  }

  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const todayStr = formatDateOnly(now);
    const tomorrow = new Date(now.getTime() + DAY_MS);
    const tomorrowStr = formatDateOnly(tomorrow);

    // Get end of current week (Sunday)
    const dayOfWeek = now.getUTCDay();
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    const endOfWeek = new Date(now.getTime() + daysUntilSunday * DAY_MS);
    const endOfWeekStr = formatDateOnly(endOfWeek);

    // Get all cobrancas
    const { data: cobrancas, error: cobErr } = await supabase
      .from("cobrancas")
      .select("id, cliente_nome, valor_parcela, data_inicio, data_fim, frequencia, criado_por");
    if (cobErr) throw cobErr;

    // Get existing pagamentos with status
    const { data: pagamentos } = await supabase
      .from("cobranca_pagamentos")
      .select("cobranca_id, data_vencimento, status");

    // Build a set of paid/exempt dates per cobranca
    const paidDates = new Set<string>();
    for (const p of pagamentos || []) {
      if (p.status === "pago" || p.status === "isento") {
        paidDates.add(`${p.cobranca_id}_${p.data_vencimento}`);
      }
    }

    // Get admins
    const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const adminIds = adminRoles?.map((r: any) => r.user_id) || [];

    // Build per-date cobranca list (only unpaid)
    interface CobrancaEntry {
      id: string;
      cliente_nome: string;
      valor_parcela: number;
      criado_por: string;
      date: string;
    }

    const todayEntries: CobrancaEntry[] = [];
    const tomorrowEntries: CobrancaEntry[] = [];
    const weekEntries: Map<string, CobrancaEntry[]> = new Map(); // date -> entries

    for (const cob of cobrancas || []) {
      const dates = generateProjectedDates(cob.data_inicio, cob.data_fim, cob.frequencia);
      for (const date of dates) {
        if (paidDates.has(`${cob.id}_${date}`)) continue;

        const entry: CobrancaEntry = {
          id: cob.id,
          cliente_nome: cob.cliente_nome,
          valor_parcela: cob.valor_parcela,
          criado_por: cob.criado_por,
          date,
        };

        if (date === todayStr) todayEntries.push(entry);
        if (date === tomorrowStr) tomorrowEntries.push(entry);
        if (date >= todayStr && date <= endOfWeekStr) {
          if (!weekEntries.has(date)) weekEntries.set(date, []);
          weekEntries.get(date)!.push(entry);
        }
      }
    }

    let notifCount = 0;
    const formatValor = (v: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

    // --- TODAY notifications: "Cobrar CLIENTE hoje" ---
    for (const entry of todayEntries) {
      const usersToNotify = new Set([entry.criado_por, ...adminIds]);
      for (const userId of usersToNotify) {
        const ok = await createNotification(
          supabase, userId,
          "📌 Cobrança Hoje",
          `Cobrar ${entry.cliente_nome} hoje — ${formatValor(entry.valor_parcela)}`,
          "lembrete_hoje",
          { cobranca_id: entry.id, cliente_nome: entry.cliente_nome, data: entry.date },
          `hoje_${entry.id}_${entry.date}`
        );
        if (ok) notifCount++;
      }
    }

    // --- TOMORROW notifications: "Cobrar CLIENTE amanhã" ---
    for (const entry of tomorrowEntries) {
      const usersToNotify = new Set([entry.criado_por, ...adminIds]);
      for (const userId of usersToNotify) {
        const ok = await createNotification(
          supabase, userId,
          "🔔 Cobrança Amanhã",
          `Cobrar ${entry.cliente_nome} amanhã — ${formatValor(entry.valor_parcela)}`,
          "lembrete_amanha",
          { cobranca_id: entry.id, cliente_nome: entry.cliente_nome, data: entry.date },
          `amanha_${entry.id}_${entry.date}`
        );
        if (ok) notifCount++;
      }
    }

    // --- WEEKLY SUMMARY: "Essa semana tem X cobranças" ---
    const totalWeekEntries = Array.from(weekEntries.values()).flat();
    if (totalWeekEntries.length > 0 && dayOfWeek === 1) {
      // Only send weekly summary on Mondays
      const weekDays: string[] = [];
      const sortedDates = Array.from(weekEntries.keys()).sort();
      for (const date of sortedDates) {
        const entries = weekEntries.get(date)!;
        const d = new Date(`${date}T00:00:00.000Z`);
        const dayName = diasSemana[d.getUTCDay()];
        const names = entries.map((e) => e.cliente_nome).join(", ");
        weekDays.push(`${dayName}: ${names}`);
      }

      const mensagem = `Essa semana tem ${totalWeekEntries.length} cobrança${totalWeekEntries.length > 1 ? "s" : ""} — ${weekDays.join(" · ")}`;

      // Notify all relevant users
      const allCreators = new Set(totalWeekEntries.map((e) => e.criado_por));
      const usersToNotify = new Set([...allCreators, ...adminIds]);

      for (const userId of usersToNotify) {
        const ok = await createNotification(
          supabase, userId,
          "📅 Resumo da Semana",
          mensagem,
          "resumo_semanal",
          { semana: todayStr, total: totalWeekEntries.length },
          `semana_${todayStr}`
        );
        if (ok) notifCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notifications_created: notifCount,
        today: todayEntries.length,
        tomorrow: tomorrowEntries.length,
        week_total: totalWeekEntries.length,
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
