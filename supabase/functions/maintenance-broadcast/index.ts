import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const base64Url = (value: Uint8Array) =>
  btoa(String.fromCharCode(...value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function getFirebaseAccessToken(serviceAccount: Record<string, string>) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = base64Url(new TextEncoder().encode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })));
  const unsigned = `${header}.${claim}`;
  const pem = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (char) => char.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error("Falha ao autenticar o envio FCM");
  return (await response.json()).access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return json({ error: "Unauthorized" }, 401);

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const backendUrl = Deno.env.get("SUPABASE_URL");
    if (!serviceKey || !backendUrl) return json({ error: "Backend indisponível" }, 500);
    const backend = createClient(backendUrl, serviceKey);
    const { data: { user }, error: authError } = await backend.auth.getUser(token);
    if (authError || user?.email?.toLowerCase() !== "srcj9975@gmail.com") {
      return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    if (typeof body.active !== "boolean") return json({ error: "active inválido" }, 400);
    const payload = JSON.stringify({
      type: "veloop-maintenance",
      active: body.active,
      titulo: body.active ? "Veloop em manutenção" : "Veloop disponível",
      mensagem: body.active ? "O app foi temporariamente colocado fora do ar." : "O app voltou a funcionar.",
      tag: "veloop-maintenance",
    });

    const { data: subscriptions, error } = await backend
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth");
    if (error) throw error;

    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    if (vapidPublic && vapidPrivate) {
      webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@veloop.app", vapidPublic, vapidPrivate);
    }

    const fcmServiceAccountRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    const fcmServiceAccount = fcmServiceAccountRaw
      ? JSON.parse(fcmServiceAccountRaw) as Record<string, string>
      : null;
    const fcmAccessToken = fcmServiceAccount ? await getFirebaseAccessToken(fcmServiceAccount) : null;
    const expired: string[] = [];
    let sent = 0;

    await Promise.allSettled((subscriptions ?? []).map(async (subscription) => {
      if (subscription.p256dh === "fcm") {
        if (!fcmAccessToken || !fcmServiceAccount?.project_id) return;
        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${fcmServiceAccount.project_id}/messages:send`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${fcmAccessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              message: {
                token: subscription.endpoint,
                data: {
                  type: "veloop-maintenance",
                  active: String(body.active),
                  titulo: body.active ? "Veloop em manutenção" : "Veloop disponível",
                  mensagem: body.active ? "O app foi temporariamente colocado fora do ar." : "O app voltou a funcionar.",
                },
              },
            }),
          },
        );
        if (response.ok) sent += 1;
        return;
      }

      if (!vapidPublic || !vapidPrivate) return;
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
        );
        sent += 1;
      } catch (pushError) {
        const status = (pushError as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) expired.push(subscription.id);
      }
    }));

    if (expired.length) await backend.from("push_subscriptions").delete().in("id", expired);
    return json({ ok: true, sent, removed: expired.length });
  } catch (error) {
    console.error("maintenance-broadcast error", error);
    return json({ error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});