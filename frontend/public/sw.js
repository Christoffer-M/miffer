// Only here for notifications: no caching, the app still loads from the network.

// Several adds in a row stack up in one notification (the last few) instead of one each.
self.addEventListener("push", (e) => {
  let body = "Something was added to the list";
  try {
    body = e.data.json().body ?? body;
  } catch {} // no or odd payload: still show something, or Safari drops the subscription
  e.waitUntil(
    self.registration.getNotifications({ tag: "added" }).then(([open]) =>
      self.registration.showNotification("miffer", {
        body: [...(open ? open.body.split("\n") : []), body].slice(-5).join("\n"),
        tag: "added",
        renotify: true,
      }),
    ),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients
      // Uncontrolled too: the page that registered this worker isn't controlled until it reloads.
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(([open]) => open?.focus() ?? self.clients.openWindow("/groceries")),
  );
});
