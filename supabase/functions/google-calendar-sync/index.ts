import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getValidAccessToken(supabase: any, userId: string): Promise<string> {
  const { data: tokens, error } = await supabase
    .from("google_calendar_tokens")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !tokens) throw new Error("Google Calendar não conectado");

  // Check if token is expired
  if (new Date(tokens.expires_at) <= new Date()) {
    // Refresh the token
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

    await supabase.from("google_calendar_tokens").update({
      access_token: data.access_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);

    return data.access_token;
  }

  return tokens.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { action, user_id } = await req.json();
    if (!user_id) throw new Error("user_id required");

    // Handle status and disconnect without needing a valid token
    if (action === "status") {
      const { data: tokens } = await supabase
        .from("google_calendar_tokens")
        .select("id, updated_at")
        .eq("user_id", user_id)
        .maybeSingle();

      return new Response(
        JSON.stringify({ connected: !!tokens, last_sync: tokens?.updated_at }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "disconnect") {
      await supabase.from("google_calendar_tokens").delete().eq("user_id", user_id);
      await supabase.from("calendar_sync").delete().eq("user_id", user_id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For export/import, we need a valid access token
    const accessToken = await getValidAccessToken(supabase, user_id);
    const calendarApi = "https://www.googleapis.com/calendar/v3";
    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

    if (action === "export") {
      // Export cobrancas to Google Calendar
      const { data: cobrancas } = await supabase
        .from("cobrancas")
        .select("id, cliente_nome, valor_parcela, data_inicio, data_fim, frequencia");

      const { data: existingSync } = await supabase
        .from("calendar_sync")
        .select("cobranca_id, google_event_id")
        .eq("user_id", user_id);

      const syncedIds = new Set(existingSync?.map((s: any) => s.cobranca_id) || []);
      let created = 0;

      for (const cob of cobrancas || []) {
        if (syncedIds.has(cob.id)) continue;

        // Get payment dates for this cobranca
        const { data: pagamentos } = await supabase
          .from("cobranca_pagamentos")
          .select("id, data_vencimento, status")
          .eq("cobranca_id", cob.id)
          .in("status", ["a_pagar", "pendente"]);

        for (const pag of pagamentos || []) {
          const valor = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cob.valor_parcela);
          const event = {
            summary: `💰 Prestação: ${cob.cliente_nome}`,
            description: `Cliente: ${cob.cliente_nome} - Valor: ${valor}\nCobrança ID: ${cob.id}`,
            start: { date: pag.data_vencimento },
            end: { date: pag.data_vencimento },
            reminders: {
              useDefault: false,
              overrides: [{ method: "popup", minutes: 1440 }], // 1 day before
            },
          };

          const res = await fetch(`${calendarApi}/calendars/primary/events`, {
            method: "POST",
            headers,
            body: JSON.stringify(event),
          });

          if (res.ok) {
            const eventData = await res.json();
            await supabase.from("calendar_sync").insert({
              user_id,
              cobranca_id: cob.id,
              google_event_id: eventData.id,
            });
            created++;
          } else {
            const err = await res.text();
            console.error("Failed to create event:", err);
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, events_created: created }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "import") {
      // Import payment-related events from Google Calendar
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

      return new Response(
        JSON.stringify({ success: true, events: data.items || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "status") {
      // Check if connected
      const { data: tokens } = await supabase
        .from("google_calendar_tokens")
        .select("id, updated_at")
        .eq("user_id", user_id)
        .maybeSingle();

      return new Response(
        JSON.stringify({ connected: !!tokens, last_sync: tokens?.updated_at }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "disconnect") {
      await supabase.from("google_calendar_tokens").delete().eq("user_id", user_id);
      await supabase.from("calendar_sync").delete().eq("user_id", user_id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error("Invalid action. Use: export, import, status, disconnect");
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
