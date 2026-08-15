// Web Push notification handler for service worker
// Works in PWA, TWA (APK), and browser contexts

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.mensagem || data.body || "",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      vibrate: [200, 100, 200, 100, 200],
      tag: data.tag || "veloop-notification",
      renotify: true,
      requireInteraction: true,
      data: { ...(data.dados || {}), soundUrl: "/notification-sound.mp3" },
      actions: [
        { action: "open", title: "Abrir" },
        { action: "dismiss", title: "Dispensar" },
      ],
    };

    // Android TWA/PWA supports the sound property natively
    if (self.navigator && self.navigator.userAgent && /android/i.test(self.navigator.userAgent)) {
      options.sound = "/notification-sound.mp3";
    }

    event.waitUntil(
      self.registration.showNotification(data.titulo || "Veloop", options)
    );
  } catch (e) {
    console.error("Push notification error:", e);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Try to focus an existing window
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      // Open new window — go to agenda for payment reminders
      return clients.openWindow("/agenda");
    })
  );
});

/* ============================================================
 * MODO FORA DO AR — bloqueio obrigatório, inclusive em PWAs desatualizados.
 * O service worker se atualiza sozinho e passa a interceptar navegações:
 * quando a manutenção está ativa, qualquer tela do app é substituída pela
 * página de manutenção — exceto /acesso (aba alternativa) e clientes liberados.
 * ============================================================ */

const MAINT_URL =
  "https://vajadqjzwveuxzmcywvn.supabase.co/storage/v1/object/public/produto_imagens/app-config/maintenance.json";
const MAINT_CACHE = "veloop-maintenance-state";
const BYPASS_KEY = "https://veloop.local/maintenance-bypass";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

let maintCache = { at: 0, active: false, ok: false };

function minutesSP() {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

function toMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

async function isMaintenanceActive() {
  // Memo curto (20s) para não pesar na navegação.
  if (Date.now() - maintCache.at < 20000) return maintCache.active;
  try {
    const res = await fetch(`${MAINT_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("config indisponível");
    const cfg = await res.json();
    let active = cfg?.manutencao === true;
    const s = cfg?.schedule;
    if (!active && s?.enabled) {
      const start = toMinutes(s.start);
      const end = toMinutes(s.end);
      if (start !== null && end !== null && start !== end) {
        const now = minutesSP();
        active = start < end ? now >= start && now < end : now >= start || now < end;
      }
    }
    maintCache = { at: Date.now(), active, ok: true };
    return active;
  } catch {
    // Offline/erro: mantém o último estado conhecido (fail-safe, sem travar o app).
    maintCache = { ...maintCache, at: Date.now() };
    return maintCache.ok ? maintCache.active : false;
  }
}

async function hasBypass() {
  try {
    const cache = await caches.open(MAINT_CACHE);
    const hit = await cache.match(BYPASS_KEY);
    if (!hit) return false;
    const { until } = await hit.json();
    if (!until || Date.now() > until) {
      await cache.delete(BYPASS_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "veloop-maintenance-bypass") {
    event.waitUntil(
      caches
        .open(MAINT_CACHE)
        .then((c) =>
          c.put(
            BYPASS_KEY,
            new Response(JSON.stringify({ until: data.until || Date.now() + 6 * 3600 * 1000 }), {
              headers: { "Content-Type": "application/json" },
            }),
          ),
        ),
    );
  }
  if (data.type === "veloop-maintenance-bypass-clear") {
    maintCache = { at: 0, active: false, ok: false };
    event.waitUntil(caches.open(MAINT_CACHE).then((c) => c.delete(BYPASS_KEY)));
  }
});

const MAINT_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Veloop — em manutenção</title>
<style>
:root{color-scheme:light dark}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
gap:14px;padding:32px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;
background:#0b0b0c;color:#f5f5f7}
h1{font-size:20px;margin:0;font-weight:800}
p{font-size:14px;margin:0;max-width:340px;color:#a1a1a6;line-height:1.5}
a{margin-top:8px;padding:10px 18px;border-radius:12px;border:1px solid #3a3a3c;color:#f5f5f7;text-decoration:none;font-size:13px;font-weight:600}
</style></head><body>
<h1>App temporariamente fora do ar</h1>
<p>Os serviços foram pausados pelo administrador para manutenção. O acesso volta automaticamente assim que for reativado.</p>
<a href="/acesso">Acesso alternativo</a>
<script>setTimeout(function(){location.reload()},30000)</script>
</body></html>`;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/acesso")) return; // aba alternativa sempre liberada

  event.respondWith(
    (async () => {
      try {
        if ((await isMaintenanceActive()) && !(await hasBypass())) {
          return new Response(MAINT_HTML, {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
          });
        }
      } catch {
        // qualquer falha na checagem não deve derrubar a navegação
      }
      return fetch(req);
    })(),
  );
});
