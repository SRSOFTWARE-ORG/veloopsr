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

function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return formatDateOnly(d);
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

async function getValidAccessToken(supabase: any, userId: string): Promise<string | null> {
  const { data: tokens, error } = await supabase
    .from("google_calendar_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !tokens) return null;

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
    if (!res.ok) return null;

    await supabase
      .from("google_calendar_tokens")
      .update({
        access_token: data.access_token,
        expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return data.access_token;
  }

  return tokens.access_token;
}

function buildEvent(clienteNome: string, valor: number, cobrancaId: string, date: string) {
  const valorStr = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
  return {
    summary: `💰 Prestação: ${clienteNome}`,
    description: `Cliente: ${clienteNome} - Valor: ${valorStr}\nCobrança ID: ${cobrancaId}`,
    start: { date },
    end: { date: nextDay(date) },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 1440 }] },
  };
}


async function _verifyAuth(req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
  });
  if (!r.ok) return null;
  return await r.json();
}
async function _isAdmin(userId: string): Promise<boolean> {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/user_roles?user_id=eq.${userId}&role=eq.admin&select=id`, {
    headers: { apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}` },
  });
  if (!r.ok) return false;
  const d = await r.json();
  return Array.isArray(d) && d.length > 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
  const _user = await _verifyAuth(req);
  if (!_user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action } = body;
    const user_id = _user.id;

    const calendarApi = "https://www.googleapis.com/calendar/v3";

    // ── STATUS ──
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

    // ── DISCONNECT ──
    if (action === "disconnect") {
      // Delete all synced Google Calendar events first
      const accessToken = await getValidAccessToken(supabase, user_id);
      if (accessToken) {
        const { data: syncs } = await supabase.from("calendar_sync").select("google_event_id").eq("user_id", user_id);
        const headers = { Authorization: `Bearer ${accessToken}` };
        for (const sync of syncs || []) {
          await fetch(`${calendarApi}/calendars/primary/events/${sync.google_event_id}`, { method: "DELETE", headers }).catch(() => {});
        }
      }
      await supabase.from("calendar_sync").delete().eq("user_id", user_id);
      await supabase.from("google_calendar_tokens").delete().eq("user_id", user_id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SYNC_COBRANCA (individual cobranca sync - create/update) ──
    if (action === "sync_cobranca") {
      const { cobranca_id } = body;
      if (!cobranca_id) throw new Error("cobranca_id required");

      const accessToken = await getValidAccessToken(supabase, user_id);
      if (!accessToken) return new Response(JSON.stringify({ skipped: true, reason: "not_connected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

      // Get cobranca data
      const { data: cob, error: cobErr } = await supabase
        .from("cobrancas")
        .select("*")
        .eq("id", cobranca_id)
        .maybeSingle();

      if (cobErr || !cob) throw new Error("Cobrança não encontrada");

      // Delete existing events for this cobranca
      const { data: existingSyncs } = await supabase
        .from("calendar_sync")
        .select("id, google_event_id")
        .eq("user_id", user_id)
        .eq("cobranca_id", cobranca_id);

      for (const sync of existingSyncs || []) {
        await fetch(`${calendarApi}/calendars/primary/events/${sync.google_event_id}`, {
          method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => {});
      }
      if ((existingSyncs || []).length > 0) {
        await supabase.from("calendar_sync").delete().eq("user_id", user_id).eq("cobranca_id", cobranca_id);
      }

      // Create new events for all projected dates
      const dates = generateProjectedDates(cob.data_inicio, cob.data_fim, cob.frequencia);
      let created = 0;

      for (const date of dates) {
        const event = buildEvent(cob.cliente_nome, cob.valor_parcela, cob.id, date);
        const res = await fetch(`${calendarApi}/calendars/primary/events`, {
          method: "POST", headers, body: JSON.stringify(event),
        });
        if (res.ok) {
          const eventData = await res.json();
          await supabase.from("calendar_sync").insert({
            user_id, cobranca_id, google_event_id: eventData.id,
          });
          created++;
        }
      }

      return new Response(JSON.stringify({ success: true, events_created: created }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DELETE_COBRANCA (remove events from calendar) ──
    if (action === "delete_cobranca") {
      const { cobranca_id } = body;
      if (!cobranca_id) throw new Error("cobranca_id required");

      const accessToken = await getValidAccessToken(supabase, user_id);
      if (!accessToken) return new Response(JSON.stringify({ skipped: true, reason: "not_connected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      const { data: syncs } = await supabase
        .from("calendar_sync")
        .select("id, google_event_id")
        .eq("user_id", user_id)
        .eq("cobranca_id", cobranca_id);

      for (const sync of syncs || []) {
        await fetch(`${calendarApi}/calendars/primary/events/${sync.google_event_id}`, {
          method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => {});
      }
      await supabase.from("calendar_sync").delete().eq("user_id", user_id).eq("cobranca_id", cobranca_id);

      return new Response(JSON.stringify({ success: true, deleted: (syncs || []).length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── FULL EXPORT (sync all, skip already synced) ──
    if (action === "export") {
      const accessToken = await getValidAccessToken(supabase, user_id);
      if (!accessToken) return new Response(JSON.stringify({ skipped: true, reason: "not_connected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

      const { data: cobrancas } = await supabase
        .from("cobrancas")
        .select("id, cliente_nome, valor_parcela, data_inicio, data_fim, frequencia");

      const { data: existingSync } = await supabase
        .from("calendar_sync")
        .select("cobranca_id")
        .eq("user_id", user_id);

      const syncedIds = new Set((existingSync || []).map((s: any) => s.cobranca_id));
      let created = 0;

      for (const cob of cobrancas || []) {
        if (syncedIds.has(cob.id)) continue; // Skip already synced

        const dates = generateProjectedDates(cob.data_inicio, cob.data_fim, cob.frequencia);
        for (const date of dates) {
          const event = buildEvent(cob.cliente_nome, cob.valor_parcela, cob.id, date);
          const res = await fetch(`${calendarApi}/calendars/primary/events`, {
            method: "POST", headers, body: JSON.stringify(event),
          });
          if (res.ok) {
            const eventData = await res.json();
            await supabase.from("calendar_sync").insert({
              user_id, cobranca_id: cob.id, google_event_id: eventData.id,
            });
            created++;
          }
        }
      }

      return new Response(JSON.stringify({ success: true, events_created: created }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── IMPORT ──
    if (action === "import") {
      const accessToken = await getValidAccessToken(supabase, user_id);
      if (!accessToken) throw new Error("Google Calendar não conectado");

      const now = new Date().toISOString();
      const maxDate = new Date();
      maxDate.setMonth(maxDate.getMonth() + 6);

      const params = new URLSearchParams({
        timeMin: now, timeMax: maxDate.toISOString(),
        q: "Prestação", singleEvents: "true", orderBy: "startTime",
      });

      const res = await fetch(`${calendarApi}/calendars/primary/events?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Calendar API error: ${JSON.stringify(data)}`);

      return new Response(JSON.stringify({ success: true, events: data.items || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Invalid action");
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
