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
  if (!(await _isAdmin(_user.id))) return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
    const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
    if (!UAZAPI_URL || !UAZAPI_TOKEN) {
      return new Response(JSON.stringify({ ok: false, error: "UAZAPI não configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const apiUrl = UAZAPI_URL.replace(/\/+$/, "");

    // Tenta conectar/obter QR code da instância
    const res = await fetch(`${apiUrl}/instance/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "token": UAZAPI_TOKEN },
      body: JSON.stringify({}),
    });
    const body = await res.text();
    let data: any = {};
    try { data = JSON.parse(body); } catch { /* keep raw */ }

    // UAZAPI normalmente retorna { qrcode: "data:image/png;base64,..." } ou { instance: { qrcode } }
    const qr = data?.qrcode || data?.instance?.qrcode || data?.qr || null;
    const status = data?.instance?.status || data?.status || (qr ? "connecting" : "unknown");

    return new Response(JSON.stringify({
      ok: res.ok,
      http_status: res.status,
      status,
      qrcode: qr,
      raw: data,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
