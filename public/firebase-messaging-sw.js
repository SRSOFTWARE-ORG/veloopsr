// Firebase Cloud Messaging Service Worker
importScripts("https://www.gstatic.com/firebasejs/11.8.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.8.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAxN7XUraOmXRG6q8SNiFfVZdwwQRlp8xw",
  authDomain: "veloop-cebae.firebaseapp.com",
  projectId: "veloop-cebae",
  storageBucket: "veloop-cebae.firebasestorage.app",
  messagingSenderId: "862663443766",
  appId: "1:862663443766:web:b09dcc82ec2c4ca1a49f97",
  measurementId: "G-8QWNZXB1V2",
});

const messaging = firebase.messaging();

const MAINT_CACHE = "veloop-maintenance-state";
const STATE_KEY = "https://veloop.local/maintenance-state";
const BYPASS_KEY = "https://veloop.local/maintenance-bypass";
const MAINT_URL =
  "https://vajadqjzwveuxzmcywvn.supabase.co/storage/v1/object/public/produto_imagens/app-config/maintenance.json";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

async function persistMaintenanceState(active) {
  const cache = await caches.open(MAINT_CACHE);
  await cache.put(
    STATE_KEY,
    new Response(JSON.stringify({ active, at: Date.now() }), {
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function hasMaintenanceBypass() {
  const cache = await caches.open(MAINT_CACHE);
  const hit = await cache.match(BYPASS_KEY);
  if (!hit) return false;
  const { until } = await hit.json();
  if (!until || Date.now() > until) {
    await cache.delete(BYPASS_KEY);
    return false;
  }
  return true;
}

async function isMaintenanceActive() {
  try {
    const response = await fetch(`${MAINT_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("config indisponível");
    const config = await response.json();
    const active = config?.manutencao === true;
    await persistMaintenanceState(active);
    return active;
  } catch {
    const cache = await caches.open(MAINT_CACHE);
    const hit = await cache.match(STATE_KEY);
    if (!hit) return false;
    return (await hit.json()).active === true;
  }
}

const MAINT_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Veloop — em manutenção</title><style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;background:#0b0b0c;color:#f5f5f7}main{max-width:360px}h1{font-size:20px;margin:0 0 14px;font-weight:800}p{font-size:14px;margin:0;color:#a1a1a6;line-height:1.5}</style></head><body><main><h1>App temporariamente fora do ar</h1><p>Os serviços foram pausados pelo administrador para manutenção. O acesso volta automaticamente assim que for reativado.</p></main><script>setTimeout(function(){location.reload()},30000)</script></body></html>`;

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.mode !== "navigate") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/acesso")) return;
  event.respondWith((async () => {
    if ((await isMaintenanceActive()) && !(await hasMaintenanceBypass())) {
      return new Response(MAINT_HTML, {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return fetch(request);
  })());
});

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw] Background message:", payload);

  const data = payload.data || {};
  if (data.type === "veloop-maintenance") {
    const active = data.active === "true";
    return (async () => {
      await persistMaintenanceState(active);
      if (!active) {
        const cache = await caches.open(MAINT_CACHE);
        await cache.delete(BYPASS_KEY);
      }
      const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
      await Promise.allSettled(
        windowClients.map(async (client) => {
          if (active && (await hasMaintenanceBypass())) return;
          await client.navigate(client.url);
        }),
      );
    })();
  }
  const notification = payload.notification || {};

  const title = data.titulo || notification.title || "Veloop";
  const options = {
    body: data.mensagem || notification.body || "",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    vibrate: [200, 100, 200, 100, 200],
    tag: data.tag || "veloop-notification",
    renotify: true,
    requireInteraction: true,
    data: { ...(data.dados ? JSON.parse(data.dados) : {}), soundUrl: "/notification-sound.mp3" },
    actions: [
      { action: "open", title: "Abrir" },
      { action: "dismiss", title: "Dispensar" },
    ],
  };

  // Android TWA/PWA supports the sound property natively
  if (self.navigator && self.navigator.userAgent && /android/i.test(self.navigator.userAgent)) {
    options.sound = "/notification-sound.mp3";
  }

  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow("/agenda");
    })
  );
});
