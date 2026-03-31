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

  // Download the file first
  const fileRes = await fetch(url);
  if (!fileRes.ok) {
    return new Response(JSON.stringify({ error: "Failed to download file" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const fileBlob = await fileRes.blob();

  // Send via multipart form to /send/media
  const formData = new FormData();
  formData.append("number", phone);
  formData.append("caption", caption || "");
  formData.append("type", "document");
  formData.append("fileName", fileName || "document.pdf");
  formData.append("file", new File([fileBlob], fileName || "document.pdf", { type: "application/pdf" }));

  const res = await fetch(`${apiUrl}/send/media`, {
    method: "POST",
    headers: { token: UAZAPI_TOKEN },
    body: formData,
  });
  const data = await res.text();

  return new Response(JSON.stringify({ status: res.status, data: data.slice(0, 500) }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
