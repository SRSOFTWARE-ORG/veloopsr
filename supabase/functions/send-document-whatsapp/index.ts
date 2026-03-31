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

  // Try multiple UAZAPI v2 endpoints for document sending
  const endpoints = [
    { path: "/send/document", body: { number: phone, url, fileName, caption } },
    { path: "/send/file", body: { number: phone, url, fileName, caption } },
    { path: "/send/media", body: { number: phone, url, fileName, caption, type: "document" } },
    { path: "/send/document", body: { chatId: `${phone}@s.whatsapp.net`, urlFile: url, fileName, caption } },
  ];

  const results = [];
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${apiUrl}${ep.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
        body: JSON.stringify(ep.body),
      });
      const data = await res.text();
      results.push({ endpoint: ep.path, status: res.status, data: data.slice(0, 200) });
      if (res.ok) break;
    } catch (e) {
      results.push({ endpoint: ep.path, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
