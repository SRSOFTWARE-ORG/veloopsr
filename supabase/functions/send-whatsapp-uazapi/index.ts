import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { evoSendText, evoConnectionState, evolutionConfigured } from "../_shared/evolution.ts";

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
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Sessão inválida" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();

    // Healthcheck mode
    // Healthcheck mode
    if (body?.health === true) {
      if (!(await evolutionConfigured())) {
        return new Response(
          JSON.stringify({ ok: false, configured: false, error: "Credenciais ausentes (EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE)" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const state = await evoConnectionState();
      const url = (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/+$/, "");
      const instance = Deno.env.get("EVOLUTION_INSTANCE") || "";
      return new Response(
        JSON.stringify({
          ok: state.connected,
          configured: true,
          status: state.state,
          debug: { url_host: (() => { try { return new URL(url).host; } catch { return url; } })(), instance, raw: state.raw },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    const { telefone, mensagem, nome_cliente, valor_transacao, data_vencimento, tipo, cobranca_id, cliente_id, cpf, status_parcela } = body;

    if (!telefone || !mensagem) {
      return new Response(
        JSON.stringify({ success: false, error: "telefone e mensagem são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!(await evolutionConfigured())) {
      return new Response(
        JSON.stringify({ success: false, error: "Evolution API não configurada. Adicione EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const r = await evoSendText(telefone, mensagem);
    const success = r.ok;

    // Audit log
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await serviceClient.from("audit_log").insert({
      user_id: user.id,
      tabela: "whatsapp_evolution",
      acao: success ? "envio_sucesso" : "envio_falha",
      detalhes: {
        telefone: telefone.replace(/\d(?=\d{4})/g, "*"),
        tipo: tipo || "manual",
        sucesso: success,
        erro: success ? null : (r.error || `HTTP ${r.status}`),
        cobranca_id: cobranca_id || null,
        cliente_id: cliente_id || null,
      },
    });

    // Webhook n8n complementar (fire-and-forget)
    const webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome_cliente, telefone, valor_transacao, data_vencimento, tipo,
          cobranca_id, cliente_id, cpf, status_parcela,
          whatsapp_enviado: success,
          timestamp: new Date().toISOString(),
          source: "veloop",
        }),
      }).catch((e) => console.warn("[Webhook n8n] fire-and-forget error:", e));
    }

    if (!success) {
      return new Response(
        JSON.stringify({ success: false, error: r.error || "Erro ao enviar via Evolution API" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, messageId: r.data?.key?.id || null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-whatsapp-evolution error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
