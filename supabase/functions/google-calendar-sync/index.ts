import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
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

    if (frequencia === "semana") {
      current = new Date(current.getTime() + 7 * DAY_MS);
    } else if (frequencia === "quinzena") {
      current = new Date(current.getTime() + 15 * DAY_MS);
    } else {
      current = addMonthsPreservingDay(current, 1);
    }
  }

  return dates;
}

async function getValidAccessToken(supabase: any, userId: string): Promise<string> {
  const { data: tokens, error } = await supabase
    .from("google_calendar_tokens")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !tokens) throw new Error("Google Calendar não conectado");

  if (new Date(tokens.expires_at) <= new Date()) {
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);

    const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    await supabase
      .from("google_calendar_tokens")
      .update({
        access_token: data.access_token,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return data.access_token;
  }

  return tokens.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { action, user_id } = await req.json();
    if (!user_id) throw new Error("user_id required");

    if (action === "status") {
      const { data: tokens } = await supabase
        .from("google_calendar_tokens")
        .select("id, updated_at")
        .eq("user_id", user_id)
        .maybeSingle();

      return new Response(JSON.stringify({ connected: !!tokens, last_sync: tokens?.updated_at }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      await supabase.from("google_calendar_tokens").delete().eq("user_id", user_id);
      await supabase.from("calendar_sync").delete().eq("user_id", user_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getValidAccessToken(supabase, user_id);
    const calendarApi = "https://www.googleapis.com/calendar/v3";
    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

    if (action === "export") {
      const { data: cobrancas, error: cobrancasError } = await supabase
        .from("cobrancas")
        .select("id, cliente_nome, valor_parcela, data_inicio, data_fim, frequencia")
        .order("created_at", { ascending: false });

      if (cobrancasError) throw cobrancasError;

      const { data: pagamentos, error: pagamentosError } = await supabase
        .from("cobranca_pagamentos")
        .select("cobranca_id, data_vencimento, status")
        .in("status", ["a_pagar", "pendente"]);

      if (pagamentosError) throw pagamentosError;

      const { data: existingSync, error: syncError } = await supabase
        .from("calendar_sync")
        .select("cobranca_id, google_event_id");

      if (syncError) throw syncError;

      const pagamentosByCobranca = new Map<string, string[]>();
      for (const pagamento of pagamentos || []) {
        const current = pagamentosByCobranca.get(pagamento.cobranca_id) || [];
        current.push(pagamento.data_vencimento);
        pagamentosByCobranca.set(pagamento.cobranca_id, current);
      }

      const syncedCobrancaIds = new Set((existingSync || []).map((sync: any) => sync.cobranca_id));
      let created = 0;
      let eligible = 0;

      for (const cob of cobrancas || []) {
        if (syncedCobrancaIds.has(cob.id)) continue;

        const persistedDates = pagamentosByCobranca.get(cob.id) || [];
        const projectedDates = generateProjectedDates(cob.data_inicio, cob.data_fim, cob.frequencia);
        const exportDates = Array.from(new Set((persistedDates.length > 0 ? persistedDates : projectedDates))).sort();

        if (exportDates.length === 0) continue;
        eligible += exportDates.length;

        for (const date of exportDates) {
          const valor = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cob.valor_parcela || 0));
          const event = {
            summary: `💰 Prestação: ${cob.cliente_nome}`,
            description: `Cliente: ${cob.cliente_nome} - Valor: ${valor}\nCobrança ID: ${cob.id}`,
            start: { date },
            end: { date },
            reminders: {
              useDefault: false,
              overrides: [{ method: "popup", minutes: 1440 }],
            },
          };

          const res = await fetch(`${calendarApi}/calendars/primary/events`, {
            method: "POST",
            headers,
            body: JSON.stringify(event),
          });

          if (!res.ok) {
            const err = await res.text();
            console.error("Failed to create event:", err);
            continue;
          }

          const eventData = await res.json();
          created++;

          if (created === 1) {
            await supabase.from("calendar_sync").insert({
              user_id,
              cobranca_id: cob.id,
              google_event_id: eventData.id,
            });
          }
        }
      }

      return new Response(JSON.stringify({ success: true, events_created: created, eligible_events: eligible }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "import") {
      const now = new Date().toISOString();
      const maxDate = new Date();
      maxDate.setMonth(maxDate.getMonth() + 6);

      const params = new URLSearchParams({
        timeMin: now,
        timeMax: maxDate.toISOString(),
        q: "Prestação",
        singleEvents: "true",
        orderBy: "startTime",
      });

      const res = await fetch(`${calendarApi}/calendars/primary/events?${params}`, { headers });
      const data = await res.json();

      if (!res.ok) throw new Error(`Calendar API error: ${JSON.stringify(data)}`);

      return new Response(JSON.stringify({ success: true, events: data.items || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Invalid action. Use: export, import, status, disconnect");
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
