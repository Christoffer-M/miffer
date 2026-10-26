// Only here for notifications: no caching, the app still loads from the network.

self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data.json();
  } catch {} // no or odd payload: still show something, or Safari drops the subscription
  e.waitUntil(data.reminder ? showReminder(data) : showAdded(data.body ?? "Something was added to the list"));
});

// Several adds in a row stack up in one notification (the last few) instead of one each.
function showAdded(body) {
  return self.registration.getNotifications({ tag: "added" }).then(([open]) =>
    self.registration.showNotification("miffer", {
      body: [...(open ? open.body.split("\n") : []), body].slice(-5).join("\n"),
      tag: "added",
      renotify: true,
    }),
  );
}

// The buttons show on Android and desktop. iPhones don't do buttons on web notifications: a tap opens the app.
function showReminder({ reminder, title, body }) {
  return self.registration.showNotification(title, {
    body,
    tag: `reminder-${reminder}`,
    renotify: true,
    data: { reminder, url: "/reminders" },
    actions: [
      { action: "done", title: "Done" },
      { action: "snooze", title: "Snooze 1 hour" },
    ],
  });
}

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const { reminder, url } = e.notification.data ?? {};
  e.waitUntil(reminder && e.action ? act(reminder, e.action) : open(url));
});

/** Done or Snooze, straight from the notification, with the token the app left in the cache (api.ts). */
async function act(id, action) {
  const token = await (await caches.match("/token"))?.text();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const request =
    action === "done"
      ? fetch(`/api/reminders/${id}/done`, { method: "POST", headers })
      : fetch(`/api/reminders/${id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ snoozedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString() }),
        });
  const res = await request.catch(() => null);
  // Offline, or the phone was unlinked: open the app so it can be done there.
  if (!token || !res?.ok) return open("/reminders");
}

/** Brings the app forward, on that screen if there is one (reminders); else opens it on Groceries. */
function open(url) {
  return (
    self.clients
      // Uncontrolled too: the page that registered this worker isn't controlled until it reloads.
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(([win]) => {
        if (!win) return self.clients.openWindow(url ?? "/groceries");
        // An app that's already open stays where it is for something added, as it always has.
        if (url) win.postMessage({ open: url }); // main.tsx takes it to that screen
        return win.focus();
      })
  );
}
