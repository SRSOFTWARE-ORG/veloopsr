// Web Push (VAPID) sender. Mantém envios via FCM em paralelo no caller.
// Recebe: { user_ids?: string[], titulo: string, mensagem: string, dados?: any, tag?: string }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@veloop.app";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return new Response(JSON.stringify({ error: "VAPID não configurado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { user_ids, titulo, mensagem, dados, tag } = body || {};
    if (!titulo || !mensagem) {
      return new Response(JSON.stringify({ error: "titulo e mensagem são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let q = sb.from("push_subscriptions").select("id,endpoint,p256dh,auth,user_id");
    if (Array.isArray(user_ids) && user_ids.length > 0) {
      q = q.in("user_id", user_ids);
    }
    const { data: subs, error } = await q;
    if (error) throw error;

    const payload = JSON.stringify({ titulo, mensagem, dados: dados || {}, tag: tag || "veloop" });

    let sent = 0;
    let failed = 0;
    const expired: string[] = [];

    await Promise.all(
      (subs || []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          sent++;
        } catch (e: any) {
          failed++;
          const code = e?.statusCode;
          if (code === 404 || code === 410) expired.push(s.id);
          else console.error("push fail", code, e?.body || e?.message);
        }
      }),
    );

    if (expired.length > 0) {
      await sb.from("push_subscriptions").delete().in("id", expired);
    }

    return new Response(JSON.stringify({ ok: true, sent, failed, removed: expired.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("web-push-send error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
