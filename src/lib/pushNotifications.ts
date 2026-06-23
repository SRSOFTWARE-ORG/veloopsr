import { supabase } from "@/integrations/supabase/client";

// Chave pública VAPID (pública por design — pode ficar no client)
const VAPID_PUBLIC_KEY =
  "BEYXfc_5nuM3aEHnemCdSm8tYfUmpoOYq-HtfCM7w-AGh6lX5mCGaEFa531ETe0yvgYVG2Nl_eb1CoDcCBx3vLs";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufToB64(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function getSwRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistrations();
    const match = existing.find((r) => r.active?.scriptURL.includes("sw-push"));
    if (match) return match;
    return await navigator.serviceWorker.register("/sw-push.js", { scope: "/" });
  } catch (e) {
    console.warn("[push] sw register failed", e);
    return null;
  }
}

export async function requestPushPermissionAndSubscribe(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (!isPushSupported()) return { ok: false, reason: "not_supported" };

  let perm = Notification.permission;
  if (perm === "default") perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: perm };

  const reg = await getSwRegistration();
  if (!reg) return { ok: false, reason: "no_sw" };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return { ok: false, reason: "no_user" };

  const payload = {
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh: bufToB64(sub.getKey("p256dh")),
    auth: bufToB64(sub.getKey("auth")),
    user_agent: navigator.userAgent,
    last_used_at: new Date().toISOString(),
  };

  await supabase.from("push_subscriptions").upsert(payload, { onConflict: "endpoint" });
  return { ok: true };
}
