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
    const UAZAPI_URL = Deno.env.get("UAZAPI_URL") || "";
    const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN") || "";

    const phone = "5527999177265";
    const msg = "⚠️ *SR SOFTWARE - Teste D-0*\n\nOlá! Sua parcela vence *hoje*.\nRegularize o pagamento.\n\n_Assistente SR SOFTWARE_";

    // Debug: show what we have (masked token)
    const debug = {
      url: UAZAPI_URL,
      token_length: UAZAPI_TOKEN.length,
      token_first5: UAZAPI_TOKEN.slice(0, 5),
      token_last5: UAZAPI_TOKEN.slice(-5),
    };

    // Try sending with token header to /send/text
    const fullUrl = `${UAZAPI_URL.replace(/\/+$/, "")}/send/text`;
    const res = await fetch(fullUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": UAZAPI_TOKEN,
      },
      body: JSON.stringify({ number: phone, text: msg, linkPreview: false }),
    });
    const body = await res.text();

    return new Response(JSON.stringify({
      debug,
      full_url: fullUrl,
      status: res.status,
      response: body.slice(0, 500),
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
