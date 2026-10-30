// Notifications, and opening the app offline: the build's files are kept here (the build fills
// in APP, see vite.config.ts), and the app opens from them when the network can't be reached.
// The lists themselves are kept by the app (remember.ts). In dev APP stays empty and nothing is kept.
const APP = { version: "", files: [] };
const APP_CACHE = `miffer-app-${APP.version}`;
// Not versioned: the same font files serve every build. ("miffer" itself holds the token, api.ts.)
const FONTS_CACHE = "miffer-fonts";

self.addEventListener("install", (e) => {
  if (!APP.files.length) return;
  // Straight from the server, not the browser's cache, so the files all come from this build.
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(APP.files.map((f) => new Request(f, { cache: "reload" })))));
});

// Takes over once the app has been closed, so an open app keeps the files it started with.
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("miffer-app-") && k !== APP_CACHE).map((k) => caches.delete(k)))),
  );
});

self.addEventListener("fetch", (e) => {
  if (!APP.files.length || e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    return e.respondWith(fromCacheFirst(FONTS_CACHE, e.request));
  }
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // Pages from the network, so phones get the latest version; the kept one only when that fails.
  // Its files are all from the same build, so it works on its own.
  if (e.request.mode === "navigate") {
    return e.respondWith(fetch(e.request).catch(() => caches.match("/index.html", { cacheName: APP_CACHE })));
  }
  if (APP.files.includes(url.pathname)) e.respondWith(fromCacheFirst(APP_CACHE, e.request));
});

async function fromCacheFirst(name, request) {
  const kept = await caches.match(request, { cacheName: name });
  if (kept) return kept;
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") {
    const copy = res.clone();
    caches.open(name).then((c) => c.put(request, copy));
  }
  return res;
}

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
  e.waitUntil(reminder && e.action ? act(reminder, e.action) : open(url, reminder));
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
  if (!token || !res?.ok) return open("/reminders", id);
}

/**
 * Brings the app forward, on that screen if there is one (reminders); else opens it on Groceries.
 * For a reminder the app asks what to do with it straight away, before any other that's due (DueReminders.tsx).
 */
function open(url, reminder) {
  return (
    self.clients
      // Uncontrolled too: the page that registered this worker isn't controlled until it reloads.
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(([win]) => {
        if (!win) return self.clients.openWindow(reminder ? `${url}?reminder=${reminder}` : (url ?? "/groceries"));
        // An app that's already open stays where it is for something added, as it always has.
        if (url) win.postMessage({ open: url, reminder }); // main.tsx takes it to that screen
        return win.focus();
      })
  );
}
