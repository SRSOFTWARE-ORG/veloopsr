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
    const UAZAPI_URL = Deno.env.get("UAZAPI_URL")!.replace(/\/+$/, "");
    const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN")!;

    const phone = "5527999177265";
    const msg = "⚠️ *SR SOFTWARE - Teste D-0*\n\nOlá! Sua parcela vence *hoje*.\nRegularize o pagamento.\n\n_Assistente SR SOFTWARE_";
    const endpoint = "/send/text";

    // Try different auth methods
    const authMethods: Record<string, HeadersInit> = {
      "header_token": { "Content-Type": "application/json", "token": UAZAPI_TOKEN },
      "bearer": { "Content-Type": "application/json", "Authorization": `Bearer ${UAZAPI_TOKEN}` },
      "header_apikey": { "Content-Type": "application/json", "apikey": UAZAPI_TOKEN },
      "header_x_token": { "Content-Type": "application/json", "x-token": UAZAPI_TOKEN },
    };

    const results: Record<string, any> = {};

    for (const [method, headers] of Object.entries(authMethods)) {
      try {
        const res = await fetch(`${UAZAPI_URL}${endpoint}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ phone, message: msg }),
        });
        const body = await res.text();
        results[method] = { status: res.status, body: body.slice(0, 300) };
        console.log(`${method} -> ${res.status}: ${body.slice(0, 100)}`);
        // If success, stop trying
        if (res.ok) break;
      } catch (e) {
        results[method] = { error: String(e) };
      }
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
