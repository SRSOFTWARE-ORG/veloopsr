import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


async function _verifyAuth(req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
  });
  if (!r.ok) return null;
  return await r.json();
}
async function _isAdmin(userId: string): Promise<boolean> {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/user_roles?user_id=eq.${userId}&role=eq.admin&select=id`, {
    headers: { apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}` },
  });
  if (!r.ok) return false;
  const d = await r.json();
  return Array.isArray(d) && d.length > 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const _user = await _verifyAuth(req);
  if (!_user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

  const arrayBuf = await fileBlob.arrayBuffer();

  // Try multiple approaches
  const results = [];

  // Approach 1: multipart with "file" field only + query param
  try {
    const fd1 = new FormData();
    fd1.append("file", new File([arrayBuf], fileName || "document.pdf", { type: "application/pdf" }));
    const r1 = await fetch(`${apiUrl}/send/media?number=${phone}&caption=${encodeURIComponent(caption)}&fileName=${encodeURIComponent(fileName)}`, {
      method: "POST",
      headers: { token: UAZAPI_TOKEN },
      body: fd1,
    });
    const d1 = await r1.text();
    results.push({ approach: "multipart+query", status: r1.status, data: d1.slice(0, 300) });
    if (r1.ok) {
      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) { results.push({ approach: "multipart+query", error: String(e) }); }

  // Approach 2: send as image/sticker style with URL in JSON to /send/link
  try {
    const r2 = await fetch(`${apiUrl}/send/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
      body: JSON.stringify({ number: phone, url, caption, title: fileName }),
    });
    const d2 = await r2.text();
    results.push({ approach: "send/link", status: r2.status, data: d2.slice(0, 300) });
    if (r2.ok) {
      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) { results.push({ approach: "send/link", error: String(e) }); }

  // Approach 3: Just send the URL as a text message with link preview
  try {
    const textMsg = `📄 ${caption}\n\n🔗 Baixe o PDF:\n${url}`;
    const r3 = await fetch(`${apiUrl}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
      body: JSON.stringify({ number: phone, text: textMsg, linkPreview: true }),
    });
    const d3 = await r3.text();
    results.push({ approach: "text+link", status: r3.status, data: d3.slice(0, 300) });
  } catch (e) { results.push({ approach: "text+link", error: String(e) }); }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
