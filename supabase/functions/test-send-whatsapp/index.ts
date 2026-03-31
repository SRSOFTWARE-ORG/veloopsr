import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
    const { telefone, mensagem } = await req.json();
    const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
    const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");

    if (!UAZAPI_URL || !UAZAPI_TOKEN) {
      return new Response(JSON.stringify({ error: "UAZAPI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let phone = (telefone || "27999177265").replace(/\D/g, "");
    if (!phone.startsWith("55")) phone = "55" + phone;

    const apiUrl = UAZAPI_URL.replace(/\/+$/, "");
    console.log(`Sending to ${phone} via ${apiUrl}`);

    const response = await fetch(`${apiUrl}/message/send-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "token": UAZAPI_TOKEN },
      body: JSON.stringify({
        phone,
        message: mensagem || "⚠️ *SR SOFTWARE - Lembrete de Cobrança D-0*\n\nOlá! Sua parcela vence *hoje*.\nRegularize o pagamento para evitar pendências.\n\nEm caso de dúvidas, responda esta mensagem.\n\n_Assistente SR SOFTWARE_",
      }),
    });

    const result = await response.json();
    console.log("UAZAPI response:", JSON.stringify(result));

    return new Response(JSON.stringify({
      success: response.ok && !result.error,
      status: response.status,
      result,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
