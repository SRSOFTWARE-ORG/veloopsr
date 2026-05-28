import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { evoSendMedia, evoSendText } from "../_shared/evolution.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const _user = await _verifyAuth(req);
  if (!_user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { phone, url, fileName, caption } = await req.json();

  // 1) Tentativa: enviar documento via Evolution
  const r1 = await evoSendMedia({
    phone,
    mediatype: "document",
    media: url,
    fileName: fileName || "document.pdf",
    caption: caption || "",
    mimetype: "application/pdf",
  });
  if (r1.ok) {
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2) Fallback: texto com link
  const textMsg = `📄 ${caption || fileName || "Documento"}\n\n🔗 Baixe o PDF:\n${url}`;
  const r2 = await evoSendText(phone, textMsg);
  return new Response(JSON.stringify({ success: r2.ok, fallback: "text", error: r2.error || r1.error }), {
    status: r2.ok ? 200 : 502,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
