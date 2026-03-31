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
