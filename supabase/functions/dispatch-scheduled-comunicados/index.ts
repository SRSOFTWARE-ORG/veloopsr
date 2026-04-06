import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceClient = createClient(supabaseUrl, serviceKey);

    // Find comunicados scheduled for now or past that are still "agendado"
    const now = new Date().toISOString();
    const { data: pendentes, error } = await serviceClient
      .from("comunicados")
      .select("id, criado_por")
      .eq("status", "agendado")
      .lte("agendado_para", now);

    if (error) throw error;
    if (!pendentes || pendentes.length === 0) {
      return new Response(JSON.stringify({ dispatched: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Scheduler] Found ${pendentes.length} comunicados to dispatch`);

    let dispatched = 0;

    for (const c of pendentes) {
      try {
        // Mark as enviando so it won't be picked up again
        await serviceClient
          .from("comunicados")
          .update({ status: "enviando" })
          .eq("id", c.id);

        // Call send-comunicado using service role (internal call)
        const res = await fetch(`${supabaseUrl}/functions/v1/send-comunicado`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ comunicado_id: c.id }),
        });

        const result = await res.json();
        console.log(`[Scheduler] Comunicado ${c.id}:`, result);

        // Send webhook to n8n if configured
        const n8nUrl = Deno.env.get("N8N_WEBHOOK_URL");
        if (n8nUrl) {
          try {
            await fetch(n8nUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                event: "comunicado_dispatched",
                comunicado_id: c.id,
                resultado: result,
                timestamp: new Date().toISOString(),
                source: "veloop_scheduler",
              }),
            });
          } catch (e) {
            console.error("[Scheduler] Webhook n8n error:", e);
          }
        }

        dispatched++;
      } catch (e) {
        console.error(`[Scheduler] Error dispatching ${c.id}:`, e);
        // Revert status so it can be retried
        await serviceClient
          .from("comunicados")
          .update({ status: "agendado" })
          .eq("id", c.id);
      }
    }

    // Audit
    await serviceClient.from("audit_log").insert({
      tabela: "comunicados",
      acao: "auto_dispatch_scheduled",
      detalhes: { total_found: pendentes.length, dispatched },
    });

    return new Response(
      JSON.stringify({ dispatched, total: pendentes.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Scheduler] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
