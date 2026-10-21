// Only here for notifications: no caching, the app still loads from the network.

// Several adds in a row stack up in one notification instead of one each.
self.addEventListener("push", (e) => {
  const { body } = e.data.json();
  e.waitUntil(
    self.registration.getNotifications({ tag: "added" }).then(([open]) =>
      self.registration.showNotification("miffer", {
        body: open ? `${open.body}\n${body}` : body,
        tag: "added",
        renotify: true,
      }),
    ),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window" }).then(([open]) => open?.focus() ?? self.clients.openWindow("/groceries")),
  );
});
