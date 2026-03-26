// Web Push notification handler for service worker
// This file is loaded by the PWA service worker

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.mensagem || data.body || "",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      sound: "/notification-sound.mp3",
      vibrate: [200, 100, 200],
      tag: data.tag || "veloop-notification",
      data: data.dados || {},
      actions: [
        { action: "open", title: "Abrir" },
        { action: "dismiss", title: "Dispensar" },
      ],
    };

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
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow("/agenda");
    })
  );
});
