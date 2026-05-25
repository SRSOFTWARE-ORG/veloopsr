import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
