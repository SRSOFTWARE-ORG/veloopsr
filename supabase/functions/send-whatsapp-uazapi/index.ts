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

    // Healthcheck mode: report config status without sending anything
    if (body?.health === true) {
      const url = Deno.env.get("UAZAPI_URL");
      const token = Deno.env.get("UAZAPI_TOKEN");
      return new Response(
        JSON.stringify({ ok: !!(url && token), configured: !!(url && token) }),
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

    const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
    const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");

    if (!UAZAPI_URL || !UAZAPI_TOKEN) {
      return new Response(
        JSON.stringify({ success: false, error: "UAZAPI não configurada. Adicione UAZAPI_URL e UAZAPI_TOKEN." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize phone: remove non-digits, ensure country code
    let phone = telefone.replace(/\D/g, "");
    if (phone.startsWith("0")) phone = phone.slice(1);
    if (!phone.startsWith("55")) phone = "55" + phone;

    // Send text message via UAZAPI
    const apiUrl = UAZAPI_URL.replace(/\/+$/, "");
    const response = await fetch(`${apiUrl}/send/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": UAZAPI_TOKEN,
      },
      body: JSON.stringify({
        number: phone,
        text: mensagem,
        linkPreview: false,
      }),
    });

    const result = await response.json();
    const success = response.ok && !result.error;

    // Audit log
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await serviceClient.from("audit_log").insert({
      user_id: user.id,
      tabela: "whatsapp_uazapi",
      acao: success ? "envio_sucesso" : "envio_falha",
      detalhes: {
        telefone: telefone.replace(/\d(?=\d{4})/g, "*"),
        tipo: tipo || "manual",
        sucesso: success,
        erro: success ? null : (result.error || `HTTP ${response.status}`),
        cobranca_id: cobranca_id || null,
        cliente_id: cliente_id || null,
      },
    });

    // Also send to n8n webhook if configured (parallel notification)
    const webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome_cliente,
          telefone,
          valor_transacao,
          data_vencimento,
          tipo,
          cobranca_id,
          cliente_id,
          cpf,
          status_parcela,
          whatsapp_enviado: success,
          timestamp: new Date().toISOString(),
          source: "veloop",
        }),
      }).catch((e) => console.warn("[Webhook n8n] fire-and-forget error:", e));
    }

    if (!success) {
      return new Response(
        JSON.stringify({ success: false, error: result.error || "Erro ao enviar via UAZAPI" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, messageId: result.key?.id || null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-whatsapp-uazapi error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
