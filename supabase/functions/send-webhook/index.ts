import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { maintenanceGuard } from "../_shared/maintenance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface WebhookPayload {
  nome_cliente: string;
  telefone: string;
  valor_transacao: number;
  data_vencimento: string;
  tipo: "entrada" | "carne" | "cobranca";
  id_venda?: string;
  cobranca_id?: string;
  cliente_id?: string;
  cpf?: string;
  status_parcela?: string;
  mensagem?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const paused = await maintenanceGuard(corsHeaders);
  if (paused) return paused;

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

    // Webhooks can transmit customer/financial data, so require an admin/CEO account.
    const { data: adminRole, error: roleError } = await supabase
      .from("user_roles").select("id").eq("user_id", user.id).eq("role", "admin").limit(1).maybeSingle();
    if (roleError) throw roleError;
    let isCeo = false;
    if (!adminRole) {
      const { data: ceoProfile, error: profileError } = await supabase
        .from("profiles").select("id").eq("id", user.id).eq("is_ceo", true).limit(1).maybeSingle();
      if (profileError) throw profileError;
      isCeo = !!ceoProfile;
    }
    if (!adminRole && !isCeo) {
      return new Response(
        JSON.stringify({ success: false, error: "Acesso restrito a administradores" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: WebhookPayload = await req.json();

    if (!body.nome_cliente || !body.telefone) {
      return new Response(
        JSON.stringify({ success: false, error: "nome_cliente e telefone são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");

    if (!webhookUrl) {
      // No webhook configured yet — log and return success so the app doesn't break
      console.warn("[Webhook] N8N_WEBHOOK_URL não configurada. Payload registrado no audit_log.");

      const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await serviceClient.from("audit_log").insert({
        user_id: user.id,
        tabela: "webhook",
        acao: "webhook_pendente",
        detalhes: { payload: body, reason: "N8N_WEBHOOK_URL não configurada" },
      });

      return new Response(
        JSON.stringify({ success: true, queued: true, message: "Webhook URL não configurada. Dados salvos para envio posterior." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send webhook to n8n
    let webhookSuccess = false;
    let webhookError = "";

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          timestamp: new Date().toISOString(),
          source: "veloop",
        }),
      });

      if (response.ok) {
        webhookSuccess = true;
      } else {
        webhookError = `HTTP ${response.status}: ${await response.text()}`;
        console.error("[Webhook] Erro:", webhookError);
      }
    } catch (err) {
      webhookError = err instanceof Error ? err.message : String(err);
      console.error("[Webhook] Network error:", webhookError);
    }

    // Audit log
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await serviceClient.from("audit_log").insert({
      user_id: user.id,
      tabela: "webhook",
      acao: webhookSuccess ? "webhook_sucesso" : "webhook_falha",
      detalhes: {
        telefone: body.telefone?.replace(/\d(?=\d{4})/g, "*"),
        tipo: body.tipo,
        sucesso: webhookSuccess,
        erro: webhookError || null,
        cobranca_id: body.cobranca_id || null,
        id_venda: body.id_venda || null,
      },
    });

    if (!webhookSuccess) {
      return new Response(
        JSON.stringify({ success: false, error: webhookError }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-webhook error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
