import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Healthcheck dos provedores de IA usados pelos scans.
// GET/POST -> testa Lovable AI Gateway e Google Gemini API direto.

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const _user = await _verifyAuth(req);
  if (!_user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const result: any = {
    timestamp: new Date().toISOString(),
    lovable_ai: { configured: false, ok: false, status: null, latency_ms: null, error: null },
    gemini_direct: { configured: false, ok: false, status: null, latency_ms: null, error: null, model: "gemini-2.5-flash" },
  };

  // 1) Lovable AI
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  result.lovable_ai.configured = !!LOVABLE_API_KEY;
  if (LOVABLE_API_KEY) {
    const t0 = Date.now();
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5,
        }),
      });
      result.lovable_ai.status = r.status;
      result.lovable_ai.latency_ms = Date.now() - t0;
      result.lovable_ai.ok = r.ok;
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        result.lovable_ai.error = t.slice(0, 200);
      } else {
        await r.text();
      }
    } catch (e) {
      result.lovable_ai.error = e instanceof Error ? e.message : String(e);
      result.lovable_ai.latency_ms = Date.now() - t0;
    }
  }

  // 2) Gemini direto
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  result.gemini_direct.configured = !!GEMINI_API_KEY;
  if (GEMINI_API_KEY) {
    const t0 = Date.now();
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${result.gemini_direct.model}:generateContent?key=${GEMINI_API_KEY}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 5 },
        }),
      });
      result.gemini_direct.status = r.status;
      result.gemini_direct.latency_ms = Date.now() - t0;
      result.gemini_direct.ok = r.ok;
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        result.gemini_direct.error = t.slice(0, 300);
      } else {
        await r.text();
      }
    } catch (e) {
      result.gemini_direct.error = e instanceof Error ? e.message : String(e);
      result.gemini_direct.latency_ms = Date.now() - t0;
    }
  }

  result.healthy = result.lovable_ai.ok || result.gemini_direct.ok;

  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
