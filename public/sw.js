// PVT Service Worker — handles push notifications
const CACHE_NAME = "pvt-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

// Handle incoming push notifications
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "New Message", body: event.data.text(), url: "/chat" };
  }

  const options = {
    body: data.body || "You have a new message",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || "pvt-message",
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: data.url || "/chat" },
    actions: [{ action: "open", title: "Open Chat" }],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "PVT", options)
  );
});

// On notification click — focus or open the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/chat";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
