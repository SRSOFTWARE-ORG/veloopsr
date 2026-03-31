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
    const msg = "Teste SR SOFTWARE";

    // Try multiple possible endpoints
    const endpoints = [
      "/send/text",
      "/message/send-text",
      "/message/text",
      "/send-text",
      "/api/send-text",
      "/chat/send/text",
    ];

    const results: Record<string, any> = {};

    for (const ep of endpoints) {
      try {
        const res = await fetch(`${UAZAPI_URL}${ep}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "token": UAZAPI_TOKEN },
          body: JSON.stringify({ phone, message: msg }),
        });
        const body = await res.text();
        results[ep] = { status: res.status, body: body.slice(0, 200) };
        console.log(`${ep} -> ${res.status}: ${body.slice(0, 100)}`);
      } catch (e) {
        results[ep] = { error: String(e) };
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
