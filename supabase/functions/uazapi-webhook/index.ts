import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Webhook receiver for UAZAPI incoming messages.
 * Configure this URL in your UAZAPI dashboard as webhook endpoint:
 * https://vajadqjzwveuxzmcywvn.supabase.co/functions/v1/uazapi-webhook
 * 
 * UAZAPI sends events like: messages.upsert, messages.update, connection.update, etc.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Log all incoming webhook events
    const event = body.event || body.type || "unknown";
    const sender = body.data?.key?.remoteJid || body.sender || null;
    const messageContent = body.data?.message?.conversation 
      || body.data?.message?.extendedTextMessage?.text
      || null;

    console.log(`[UAZAPI Webhook] Event: ${event}, From: ${sender}`);

    // Store incoming message in audit_log for now
    await supabase.from("audit_log").insert({
      tabela: "whatsapp_uazapi",
      acao: "webhook_recebido",
      detalhes: {
        event,
        sender: sender ? sender.replace(/\d(?=\d{4})/g, "*") : null,
        has_message: !!messageContent,
        timestamp: new Date().toISOString(),
      },
    });

    // Forward to n8n if configured
    const webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "uazapi_incoming",
          event,
          sender,
          message: messageContent,
          raw: body,
          timestamp: new Date().toISOString(),
        }),
      }).catch((e) => console.warn("[n8n forward] error:", e));
    }

    // If it's an incoming message, try to match with a client
    if (event === "messages.upsert" && sender && messageContent) {
      const phoneClean = sender.replace("@s.whatsapp.net", "").replace(/\D/g, "");
      
      // Try to find matching client by phone
      const { data: clienteMatch } = await supabase
        .from("clientes")
        .select("id, nome, telefone")
        .or(`telefone.ilike.%${phoneClean.slice(-8)}%`)
        .limit(1)
        .maybeSingle();

      if (clienteMatch) {
        // Get all admin users for notification
        const { data: adminRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        for (const admin of adminRoles || []) {
          await supabase.from("notificacoes").insert({
            user_id: admin.user_id,
            titulo: "💬 Mensagem WhatsApp",
            mensagem: `${clienteMatch.nome} enviou: "${messageContent.slice(0, 100)}"`,
            tipo: "whatsapp_recebido",
            dados: {
              cliente_id: clienteMatch.id,
              cliente_nome: clienteMatch.nome,
              telefone: phoneClean,
              mensagem_preview: messageContent.slice(0, 200),
              dedup_key: `whatsapp_${phoneClean}_${Date.now()}`,
            },
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("uazapi-webhook error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
