import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const UAZAPI_URL = Deno.env.get("UAZAPI_URL") || "";
  const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN") || "";

  const { phone, url, fileName, caption } = await req.json();

  const apiUrl = UAZAPI_URL.replace(/\/+$/, "");
  const res = await fetch(`${apiUrl}/send/document`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
    body: JSON.stringify({ number: phone, url, fileName, caption }),
  });

  const data = await res.text();
  return new Response(JSON.stringify({ status: res.status, data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
