import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getAccessToken(serviceAccount: any): Promise<string> {
  // Create JWT for Google OAuth2
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));

  const unsignedToken = `${header}.${claim}`;

  // Import the private key
  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${unsignedToken}.${encodedSignature}`;

  // Exchange JWT for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Get push subscriptions
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", user.id);

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ error: "no_subscription", message: "Nenhuma inscrição push encontrada. Ative o Push primeiro." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = {
      titulo: "🔔 Teste de Notificação",
      mensagem: "Se você recebeu esta notificação com o app fechado, tudo está funcionando!",
      tag: `test-push-${Date.now()}`,
    };

    let sent = 0;

    // Check if we have FCM tokens (p256dh === 'fcm')
    const fcmSubs = subs.filter(s => s.p256dh === "fcm");
    const vapidSubs = subs.filter(s => s.p256dh !== "fcm");

    // Send via FCM HTTP v1 API
    if (fcmSubs.length > 0) {
      const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
      if (serviceAccountJson) {
        try {
          const serviceAccount = JSON.parse(serviceAccountJson);
          const accessToken = await getAccessToken(serviceAccount);
          const projectId = serviceAccount.project_id;

          for (const sub of fcmSubs) {
            try {
              const res = await fetch(
                `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    message: {
                      token: sub.endpoint,
                      data: {
                        titulo: payload.titulo,
                        mensagem: payload.mensagem,
                        tag: payload.tag,
                      },
                      webpush: {
                        notification: {
                          title: payload.titulo,
                          body: payload.mensagem,
                          icon: "/icons/icon-192x192.png",
                          badge: "/icons/icon-192x192.png",
                        },
                      },
                    },
                  }),
                }
              );

              if (res.ok) {
                sent++;
              } else {
                const errBody = await res.text();
                console.error("FCM send failed:", errBody);
              }
            } catch (err) {
              console.error("FCM push failed:", sub.endpoint, err);
            }
          }
        } catch (err) {
          console.error("FCM auth error:", err);
        }
      }
    }

    // Fallback: send via web-push for VAPID subscriptions
    if (vapidSubs.length > 0) {
      const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
      const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

      if (vapidPublicKey && vapidPrivateKey) {
        const { default: webpush } = await import("npm:web-push@3.6.7");
        webpush.setVapidDetails("mailto:admin@veloop.app", vapidPublicKey, vapidPrivateKey);

        for (const sub of vapidSubs) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify(payload)
            );
            sent++;
          } catch (err) {
            console.error("VAPID push failed:", sub.endpoint, err);
          }
        }
      }
    }

    // Also insert into notificacoes for in-app display
    await supabase.from("notificacoes").insert({
      user_id: user.id,
      titulo: payload.titulo,
      mensagem: payload.mensagem,
      tipo: "teste",
    });

    return new Response(JSON.stringify({ success: true, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
