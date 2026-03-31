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

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw] Background message:", payload);

  const data = payload.data || {};
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
