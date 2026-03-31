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

  // Convert to base64
  const arrayBuf = await fileBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);

  // Try JSON body with base64
  const res = await fetch(`${apiUrl}/send/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
    body: JSON.stringify({
      number: phone,
      media: `data:application/pdf;base64,${base64}`,
      fileName: fileName || "document.pdf",
      caption: caption || "",
      type: "document",
    }),
  });
  const data = await res.text();

  return new Response(JSON.stringify({ status: res.status, data: data.slice(0, 500) }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
