// Needs Postgres running: `pnpm db` from the repo root.
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import webpush from "web-push";
import { app } from "./app.js";
import { eq, sql as q } from "drizzle-orm";
import { db, schema, sql } from "./db/index.js";
import { fireDue } from "./reminders.js";
import { fillEnds } from "./watched.js";
import { readFileSync } from "node:fs";

// A throwaway key pair, only so push.ts turns notifications on. Set before it's imported.
vi.hoisted(() => {
  process.env.VAPID_PUBLIC_KEY =
    "BFboTDHfxJXoeI1Mo01jA5MgTUCTTaw3TMVQjedY42rtMqYpvBlbBKasuxQxuGBZKjPpgqXdxGo8OU1MS-_-6rA";
  process.env.VAPID_PRIVATE_KEY = "r5JiyoGcuNrkZVAvQYcPfsC-rfXROnsF1Nl61-hGyXA";
  process.env.TMDB_API_KEY = "test-key"; // fetch is faked in the search test
});

process.env.TRUST_PROXY = "true"; // the tests stand in for nginx-proxy and set X-Real-IP themselves

beforeAll(() => migrate(db, { migrationsFolder: "./drizzle" }));
afterAll(() => sql.end());

function call(path: string, opts: { method?: string; token?: string; body?: unknown; ip?: string } = {}) {
  return app.request(`/api${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token && { Authorization: `Bearer ${opts.token}` }),
      ...(opts.ip && { "X-Real-IP": opts.ip }),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

test("linked phones share one list, and nobody else sees it", async () => {
  const you = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();
  const partner = await (
    await call("/households/join", { method: "POST", body: { code: you.code.toLowerCase(), name: " Ben " } })
  ).json();

  const id = crypto.randomUUID();
  expect((await call("/items", { method: "POST", token: you.token, body: { id, name: " Milk " } })).status).toBe(204);
  expect((await call(`/items/${id}`, { method: "PATCH", token: partner.token, body: { done: true } })).status).toBe(204);

  const list = await (await call("/items", { token: you.token })).json();
  expect(list).toEqual([expect.objectContaining({ id, name: "Milk", done: true, addedBy: you.deviceId })]);

  // Codes are single-use.
  expect((await call("/households/join", { method: "POST", body: { code: you.code, name: "Eve" } })).status).toBe(404);

  // Another household can't see or change it.
  const stranger = await (await call("/households", { method: "POST", body: { name: "Eve" } })).json();
  expect(await (await call("/items", { token: stranger.token })).json()).toEqual([]);
  await call(`/items/${id}`, { method: "DELETE", token: stranger.token });
  expect(await (await call("/items", { token: you.token })).json()).toHaveLength(1);

  // Clearing ticked items.
  await call("/items/done", { method: "DELETE", token: partner.token });
  expect(await (await call("/items", { token: you.token })).json()).toEqual([]);

  expect((await call("/items")).status).toBe(401);
});

test("a household can grow to a family, and a phone can be removed", async () => {
  const anna = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();
  expect((await call("/households", { method: "POST", body: { name: "  " } })).status).toBe(400);

  // Each new phone needs its own code.
  const join = async (name: string) => {
    const { code } = await (await call("/households/code", { method: "POST", token: anna.token })).json();
    return (await call("/households/join", { method: "POST", body: { code, name } })).json();
  };
  const ben = await join("Ben");
  const kid = await join("Kid");

  const me = await (await call("/households/me", { token: ben.token })).json();
  expect(me.deviceId).toBe(ben.deviceId);
  expect(me.members.map((m: { name: string }) => m.name)).toEqual(["Anna", "Ben", "Kid"]);

  // Renaming changes only your own name.
  expect((await call("/households/me", { method: "PATCH", token: ben.token, body: { name: " Benny " } })).status).toBe(204);
  expect((await call("/households/me", { method: "PATCH", token: ben.token, body: { name: "" } })).status).toBe(400);
  const renamed = await (await call("/households/me", { token: anna.token })).json();
  expect(renamed.members.map((m: { name: string }) => m.name)).toEqual(["Anna", "Benny", "Kid"]);

  // A stranger can't remove anyone.
  const stranger = await (await call("/households", { method: "POST", body: { name: "Eve" } })).json();
  await call(`/households/members/${kid.deviceId}`, { method: "DELETE", token: stranger.token });
  expect((await call("/items", { token: kid.token })).status).toBe(200);

  // Removing the kid's lost phone revokes its token at once.
  await call(`/households/members/${kid.deviceId}`, { method: "DELETE", token: anna.token });
  expect((await call("/items", { token: kid.token })).status).toBe(401);
  const after = await (await call("/households/me", { token: anna.token })).json();
  expect(after.members).toHaveLength(2);
});

test("what a household adds becomes its suggestions, and stays after Clear", async () => {
  const you = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();
  const add = (name: string, id = crypto.randomUUID()) =>
    call("/items", { method: "POST", token: you.token, body: { id, name } });

  const milk = crypto.randomUUID();
  await add("mælk", milk);
  await add("mælk", milk); // a retried request isn't counted twice
  await call(`/items/${milk}`, { method: "PATCH", token: you.token, body: { done: true } });
  await call("/items/done", { method: "DELETE", token: you.token });
  await add("Mælk"); // the same thing, typed differently
  await add("Rugbrød");

  expect(await (await call("/items/history", { token: you.token })).json()).toEqual([
    { name: "Mælk", count: 2, lastAddedAt: expect.any(String) },
    { name: "Rugbrød", count: 1, lastAddedAt: expect.any(String) },
  ]);

  const stranger = await (await call("/households", { method: "POST", body: { name: "Eve" } })).json();
  expect(await (await call("/items/history", { token: stranger.token })).json()).toEqual([]);
});

test("undo puts removed items back as they were", async () => {
  const you = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();
  const add = (id: string, name: string) => call("/items", { method: "POST", token: you.token, body: { id, name } });
  const list = async () => (await call("/items", { token: you.token })).json();

  const milk = crypto.randomUUID();
  const bread = crypto.randomUUID();
  await add(milk, "Mælk");
  await add(bread, "Rugbrød");
  await call(`/items/${milk}`, { method: "PATCH", token: you.token, body: { done: true } });
  const before = await list();

  await call(`/items/${milk}`, { method: "DELETE", token: you.token });
  const removed = before.find((i: { id: string }) => i.id === milk);
  const restore = (body: unknown, token = you.token) => call("/items/restore", { method: "POST", token, body });
  expect((await restore([removed])).status).toBe(204);
  expect((await restore([removed])).status).toBe(204); // a retry is fine
  expect(await list()).toEqual(before.map((i: object) => ({ ...i, updatedAt: expect.any(String) })));

  // Suggestions don't count it as added again.
  const history = await (await call("/items/history", { token: you.token })).json();
  expect(history.find((h: { name: string }) => h.name === "Mælk").count).toBe(1);

  // Nobody outside the household can be named as the one who added it, or take over an item.
  const stranger = await (await call("/households", { method: "POST", body: { name: "Eve" } })).json();
  const eggs = { id: crypto.randomUUID(), name: "Æg", done: false, addedBy: stranger.deviceId, createdAt: new Date().toISOString() };
  await restore([eggs]);
  expect((await list()).find((i: { id: string }) => i.id === eggs.id).addedBy).toBeNull();
  await restore([{ ...removed, name: "Stolen" }], stranger.token);
  expect(await (await call("/items", { token: stranger.token })).json()).toEqual([]);
});

test("guessing codes gets cut off after a few tries, per address", async () => {
  const guess = (ip: string) =>
    call("/households/join", { method: "POST", ip, body: { code: "ZZZZZZ", name: "Eve" } });

  for (let i = 0; i < 10; i++) expect((await guess("203.0.113.7")).status).toBe(404);
  const blocked = await guess("203.0.113.7");
  expect(blocked.status).toBe(429);
  expect(await blocked.json()).toEqual({ error: "Too many tries. Wait a few minutes and try again." });

  // Someone else linking up at the same time isn't affected.
  expect((await guess("198.51.100.2")).status).toBe(404);
});

test("checking a code says whether it works, without using it up", async () => {
  const ip = "192.0.2.10";
  const check = (code: string) => call("/households/check", { method: "POST", ip, body: { code } });
  const you = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();

  expect((await check(you.code.toLowerCase())).status).toBe(204);
  expect((await check("ZZZZZZ")).status).toBe(404);
  expect((await call("/households/join", { method: "POST", ip, body: { code: you.code, name: "Ben" } })).status).toBe(201);
  expect((await check(you.code)).status).toBe(404); // used up by the join
});

test("several invites can be out at once, and each links one phone", async () => {
  const anna = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();
  const invite = async () => (await (await call("/households/code", { method: "POST", token: anna.token })).json()).code;
  const forBen = await invite();
  const forKid = await invite(); // doesn't break Ben's

  const join = (code: string, name: string) => call("/households/join", { method: "POST", body: { code, name } });
  expect((await join(forBen, "Ben")).status).toBe(201);
  expect((await join(forKid, "Kid")).status).toBe(201);
  expect((await join(forBen, "Eve")).status).toBe(404);
  expect((await join(anna.code, "Max")).status).toBe(201); // the code from starting the household still works too
});

test("a phone can turn notifications on and off, but only to a real push service", async () => {
  const anna = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();
  const pushOn = async () => (await (await call("/households/me", { token: anna.token })).json()).pushOn;
  const subscribe = (endpoint: string) =>
    call("/households/me/push", { method: "PUT", token: anna.token, body: { endpoint, keys: { p256dh: "k", auth: "a" } } });

  expect(await pushOn()).toBe(false);
  expect((await subscribe("https://fcm.googleapis.com/fcm/send/abc")).status).toBe(204);
  expect(await pushOn()).toBe(true);
  // Anything else would have the server POST wherever a caller likes.
  for (const bad of [
    "http://fcm.googleapis.com/x",
    "https://evilgoogleapis.com/x",
    "https://storage.googleapis.com/someones-bucket/x",
    "https://db:5432/",
    "nope",
  ]) {
    expect((await subscribe(bad)).status).toBe(400);
  }
  expect((await call("/households/me/push", { method: "DELETE", token: anna.token })).status).toBe(204);
  expect(await pushOn()).toBe(false);
});

test("adding something notifies everyone else with notifications on, and gone ones are cleared", async () => {
  const send = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
  const anna = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();
  const ben = await (await call("/households/join", { method: "POST", body: { code: anna.code, name: "Ben" } })).json();
  const endpoint = `https://fcm.googleapis.com/fcm/send/${ben.deviceId}`;
  await call("/households/me/push", { method: "PUT", token: ben.token, body: { endpoint, keys: { p256dh: "k", auth: "a" } } });
  const add = (token: string, name: string) =>
    call("/items", { method: "POST", token, body: { id: crypto.randomUUID(), name } });

  await add(anna.token, "Milk");
  await vi.waitFor(() =>
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ endpoint }), JSON.stringify({ body: "Anna added Milk" }), expect.anything()),
  );

  // Not to the phone that added it.
  send.mockClear();
  await add(ben.token, "Eggs");
  await new Promise((r) => setTimeout(r, 100));
  expect(send).not.toHaveBeenCalled();

  // The push service says Ben's subscription is gone.
  send.mockRejectedValue(Object.assign(new Error("gone"), { statusCode: 410 }));
  await add(anna.token, "Bread");
  await vi.waitFor(async () =>
    expect((await (await call("/households/me", { token: ben.token })).json()).pushOn).toBe(false),
  );
  send.mockRestore();
});

test("reminders reach who they're for once, snooze, and repeat on the wall clock", async () => {
  const send = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
  const anna = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();
  const ben = await (await call("/households/join", { method: "POST", body: { code: anna.code, name: "Ben" } })).json();
  for (const p of [anna, ben]) {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${p.deviceId}`;
    await call("/households/me/push", { method: "PUT", token: p.token, body: { endpoint, keys: { p256dh: "k", auth: "a" } } });
  }
  const sentTo = () => send.mock.calls.map(([sub, payload]) => [sub.endpoint.split("/").pop(), JSON.parse(String(payload))]);
  const list = async () => (await call("/reminders", { token: anna.token })).json();
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const HOUR = 60 * 60 * 1000;
  const fields = { notes: "", repeat: null, forDevice: null, timeZone: "Europe/Copenhagen" };

  // Due an hour ago, weekly, for Ben: only Ben's phone hears about it, and only once.
  const trash = crypto.randomUUID();
  const add = (body: object) => call("/reminders", { method: "POST", token: anna.token, body: { ...fields, ...body } });
  // Monday 18:00 in Copenhagen, in summer time.
  const summer = "2026-07-06T16:00:00.000Z";
  expect((await add({ id: trash, title: "Take out the trash", remindAt: summer, repeat: "week", forDevice: ben.deviceId })).status).toBe(204);
  await fireDue();
  await fireDue();
  expect(sentTo()).toEqual([[ben.deviceId, { reminder: trash, title: "Take out the trash", body: "From Anna · weekly" }]]);
  expect(await list()).toEqual([expect.objectContaining({ id: trash, notified: true, done: false })]);

  // Snoozed: quiet until the snooze is over.
  send.mockClear();
  const snooze = (until: string) => call(`/reminders/${trash}`, { method: "PATCH", token: ben.token, body: { snoozedUntil: until } });
  await snooze(new Date(Date.now() + HOUR).toISOString());
  await fireDue();
  expect(send).not.toHaveBeenCalled();
  await snooze(ago(1000));
  await fireDue();
  expect(sentTo()).toHaveLength(1);

  // Done with a repeating one: it moves on to the next Monday after now, still 18:00 local
  // whether or not the clocks have changed since.
  const [beforeDone] = await list();
  const doneRes = await call(`/reminders/${trash}/done`, { method: "POST", token: ben.token });
  expect(doneRes.status).toBe(200);
  const afterDone = await doneRes.json();
  const [next] = await list();
  expect(afterDone).toEqual({ remindAt: next.remindAt, snoozedUntil: null, done: false });
  const local = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Copenhagen", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  expect(next).toMatchObject({ done: false, notified: false, snoozedUntil: null });
  expect(local(next.remindAt)).toBe("Mon 18:00");
  expect(Date.parse(next.remindAt) - Date.now()).toBeGreaterThan(0);
  expect(Date.parse(next.remindAt) - Date.now()).toBeLessThanOrEqual(7 * 24 * HOUR);

  // Undo: back to due as it was, and not sent a second time.
  send.mockClear();
  const { remindAt, snoozedUntil, notified, done } = beforeDone;
  const restore = { method: "PUT", token: anna.token, body: { remindAt, snoozedUntil, notified, done, ifStill: afterDone } };
  expect((await call(`/reminders/${trash}/state`, restore)).status).toBe(204);
  await fireDue();
  expect(send).not.toHaveBeenCalled();
  expect(await list()).toEqual([expect.objectContaining({ remindAt, notified: true, done: false })]);
  await call(`/reminders/${trash}/done`, { method: "POST", token: ben.token });

  // Ticked off before it's due: skips to the one after.
  const plants = crypto.randomUUID();
  const tomorrow = new Date(Date.now() + 24 * HOUR).toISOString();
  await add({ id: plants, title: "Water the plants", remindAt: tomorrow, repeat: "day" });
  await call(`/reminders/${plants}/done`, { method: "POST", token: anna.token });
  const skipped = (await list()).find((r: { id: string }) => r.id === plants);
  expect(local(skipped.remindAt).slice(-5)).toBe(local(tomorrow).slice(-5));
  expect(Date.parse(skipped.remindAt) - Date.parse(tomorrow)).toBeGreaterThanOrEqual(23 * HOUR);
  await call(`/reminders/${plants}`, { method: "DELETE", token: anna.token });

  // A one-off for everyone: both phones; done means done, and Clear removes it.
  send.mockClear();
  const vet = crypto.randomUUID();
  await add({ id: vet, title: "Call the vet", notes: "Ask about the booster", remindAt: ago(1000) });
  await fireDue();
  expect(sentTo().map(([to]) => to).sort()).toEqual([anna.deviceId, ben.deviceId].sort());
  expect(sentTo()[0][1].body).toBe("Ask about the booster");
  await call(`/reminders/${vet}/done`, { method: "POST", token: anna.token });
  expect((await list()).find((r: { id: string }) => r.id === vet).done).toBe(true);
  await call("/reminders/done", { method: "DELETE", token: anna.token });
  expect((await list()).map((r: { id: string }) => r.id)).toEqual([trash]);

  // Only for someone in the household, and nobody else can see or touch them.
  const stranger = await (await call("/households", { method: "POST", body: { name: "Eve" } })).json();
  expect((await add({ id: crypto.randomUUID(), title: "x", remindAt: null, forDevice: stranger.deviceId })).status).toBe(400);
  expect(await (await call("/reminders", { token: stranger.token })).json()).toEqual([]);
  await call(`/reminders/${trash}`, { method: "DELETE", token: stranger.token });
  await call(`/reminders/${trash}`, { method: "PATCH", token: stranger.token, body: { title: "Hacked" } });
  expect(await list()).toEqual([expect.objectContaining({ id: trash, title: "Take out the trash" })]);
  for (const timeZone of ["Mars/Olympus", "+01:00"]) {
    expect((await add({ id: crypto.randomUUID(), title: "x", remindAt: null, timeZone })).status).toBe(400);
  }
  send.mockRestore();
});

test("a repeating reminder nobody ticks off still comes round, and edits make it wait again", async () => {
  const send = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
  const anna = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();
  const endpoint = `https://fcm.googleapis.com/fcm/send/${anna.deviceId}`;
  await call("/households/me/push", { method: "PUT", token: anna.token, body: { endpoint, keys: { p256dh: "k", auth: "a" } } });
  const DAY = 24 * 60 * 60 * 1000;
  const id = crypto.randomUUID();
  const get = async () => (await (await call("/reminders", { token: anna.token })).json())[0];
  const sends = () => send.mock.calls.filter(([sub]) => sub.endpoint === endpoint).length;
  const patch = (body: object) => call(`/reminders/${id}`, { method: "PATCH", token: anna.token, body });

  // Daily, set three days in the past: sent once, from its latest time, not once for each day missed.
  const fields = { title: "Feed the cat", notes: "", repeat: "day", forDevice: null, timeZone: "Europe/Copenhagen" };
  await call("/reminders", { method: "POST", token: anna.token, body: { id, ...fields, remindAt: new Date(Date.now() - 3 * DAY).toISOString() } });
  await fireDue();
  await fireDue();
  expect(sends()).toBe(1);
  const latest = Date.parse((await get()).remindAt);
  expect(Date.now() - latest).toBeLessThan(DAY);

  // Never ticked off: a day later it's sent again.
  const { reminders } = schema;
  await db.update(reminders).set({ remindAt: q`${reminders.remindAt} - interval '1 day'` }).where(eq(reminders.id, id));
  await fireDue();
  expect(sends()).toBe(2);
  expect(await get()).toMatchObject({ notified: true, done: false });

  // A snooze or a new time makes it wait again; a new time also ends the snooze.
  await patch({ snoozedUntil: new Date(Date.now() + DAY).toISOString() });
  expect(await get()).toMatchObject({ notified: false, snoozedUntil: expect.any(String) });
  const later = new Date(Date.now() + 2 * DAY).toISOString();
  await patch({ remindAt: later, repeat: null });
  expect(await get()).toMatchObject({ notified: false, snoozedUntil: null, remindAt: later });

  // Done, then put back.
  await call(`/reminders/${id}/done`, { method: "POST", token: anna.token });
  expect(await get()).toMatchObject({ done: true });
  await patch({ done: false });
  expect(await get()).toMatchObject({ done: false, remindAt: later });
  send.mockRestore();
});

test("undo puts a reminder back as it was, unless another phone changed it since", async () => {
  const send = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
  const anna = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();
  const id = crypto.randomUUID();
  const get = async () => (await (await call("/reminders", { token: anna.token })).json())[0];
  const patch = (body: object) => call(`/reminders/${id}`, { method: "PATCH", token: anna.token, body });
  const tickOff = async () => (await call(`/reminders/${id}/done`, { method: "POST", token: anna.token })).json();
  const undo = (before: { remindAt: string; snoozedUntil: string | null; notified: boolean; done: boolean }, ifStill: object) => {
    const { remindAt, snoozedUntil, notified, done } = before;
    return call(`/reminders/${id}/state`, { method: "PUT", token: anna.token, body: { remindAt, snoozedUntil, notified, done, ifStill } });
  };

  // A one-off, due a second ago.
  const fields = { title: "Mop the floor", notes: "", repeat: null, forDevice: null, timeZone: "Europe/Copenhagen" };
  await call("/reminders", { method: "POST", token: anna.token, body: { id, ...fields, remindAt: new Date(Date.now() - 1000).toISOString() } });
  await fireDue();
  const due = await get();
  expect(due).toMatchObject({ notified: true, done: false, snoozedUntil: null });

  // Snoozed, then undone: due again as it was.
  const later = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await patch({ snoozedUntil: later });
  expect((await undo(due, { remindAt: due.remindAt, snoozedUntil: later, done: false })).status).toBe(204);
  expect(await get()).toEqual(due);

  // Ticked off, then undone: not done any more.
  const afterDone = await tickOff();
  expect(afterDone).toEqual({ remindAt: due.remindAt, snoozedUntil: null, done: true });
  expect((await undo(due, afterDone)).status).toBe(204);
  expect(await get()).toEqual(due);

  // Snoozed, then another phone gives it a new time before the Undo: the new time stays.
  await patch({ snoozedUntil: later });
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await patch({ remindAt: tomorrow });
  expect((await undo(due, { remindAt: due.remindAt, snoozedUntil: later, done: false })).status).toBe(409);
  expect(await get()).toMatchObject({ remindAt: tomorrow, snoozedUntil: null, notified: false });

  // Gone: nothing to tick off.
  await call(`/reminders/${id}`, { method: "DELETE", token: anna.token });
  expect((await call(`/reminders/${id}/done`, { method: "POST", token: anna.token })).status).toBe(404);
  send.mockRestore();
});

// Last: it uses up everyone's tries for this window.
test("the watchlist is shared, a movie is on it once, and watched ones can come back", async () => {
  const anna = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();
  // Its own address: the tests before this use up the join tries of the default one.
  const join = { code: anna.code, name: "Ben" };
  const ben = await (await call("/households/join", { method: "POST", body: join, ip: "10.0.0.7" })).json();
  const list = async (token = anna.token) => (await call("/watch", { token })).json();
  const add = (token: string, body: object) =>
    call("/watch", { method: "POST", token, body: { id: crypto.randomUUID(), tmdbId: null, year: null, posterPath: null, ...body } });

  // Ben has notifications on, but a new title doesn't send one.
  const endpoint = `https://fcm.googleapis.com/fcm/send/${ben.deviceId}`;
  await call("/households/me/push", { method: "PUT", token: ben.token, body: { endpoint, keys: { p256dh: "k", auth: "a" } } });
  const send = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });

  const dune = { title: "Dune: Part Two", kind: "movie", tmdbId: 693134, year: 2024, posterPath: "/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg" };
  expect((await add(anna.token, dune)).status).toBe(204);
  await new Promise((r) => setTimeout(r, 100));
  expect(send).not.toHaveBeenCalled();
  send.mockRestore();
  await add(ben.token, dune); // the same movie from the other phone
  await add(ben.token, { title: "Dune", kind: "series", tmdbId: 693134 }); // same number, but a series
  await add(ben.token, { title: "Home video", kind: "movie" });
  await add(ben.token, { title: "Home video", kind: "movie" }); // typed by hand: not checked
  // A poster is only ever a TMDB image name, never an address of someone's choosing.
  expect((await add(ben.token, { title: "Bad", kind: "movie", posterPath: "//evil.example/x.jpg" })).status).toBe(400);
  const [, , , first] = await list(ben.token);
  expect(first).toMatchObject({ ...dune, addedBy: anna.deviceId, watchedAt: null });
  expect(await list()).toHaveLength(4);

  await call(`/watch/${first.id}`, { method: "PATCH", token: ben.token, body: { watched: true } });
  expect((await list()).find((w: { id: string }) => w.id === first.id).watchedAt).toEqual(expect.any(String));
  await call(`/watch/${first.id}`, { method: "PATCH", token: ben.token, body: { watched: false } });
  expect((await list()).find((w: { id: string }) => w.id === first.id).watchedAt).toBeNull();

  // Undo of a delete puts it back as it was.
  const before = await list();
  await call(`/watch/${first.id}`, { method: "DELETE", token: anna.token });
  expect(await list()).toHaveLength(3);
  await call("/watch/restore", { method: "POST", token: anna.token, body: first });
  expect(await list()).toEqual(before);

  // Another household sees none of it and can't change it.
  const eve = await (await call("/households", { method: "POST", body: { name: "Eve" } })).json();
  expect(await list(eve.token)).toEqual([]);
  await call(`/watch/${first.id}`, { method: "DELETE", token: eve.token });
  await call("/watch/restore", { method: "POST", token: eve.token, body: { ...first, title: "Stolen" } });
  expect(await list()).toEqual(before);
});

test("search finds movies and series on TMDB, by the title people know them by", async () => {
  const anna = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();
  const tmdb = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      results: [
        { id: 1, media_type: "movie", title: "Another Round", original_title: "Druk", original_language: "da", release_date: "2020-09-24", poster_path: "/aDcIt4NHURLKnAEu7gow51Yd00Q.jpg", overview: "Four teachers test a theory.", vote_average: 7.654, vote_count: 3000 },
        { id: 2, media_type: "person", name: "Mads Mikkelsen" },
        { id: 3, media_type: "tv", name: "Squid Game", original_name: "오징어 게임", original_language: "ko", first_air_date: "2021-09-17", overview: "", vote_average: 9, vote_count: 3 },
        { id: 4, media_type: "movie", title: "Untitled", original_title: "Untitled", original_language: "en", release_date: "" },
      ],
    }),
  );

  const res = await call("/watch/search?q=druk", { token: anna.token });
  expect(await res.json()).toEqual([
    { tmdbId: 1, kind: "movie", title: "Druk", year: 2020, posterPath: "/aDcIt4NHURLKnAEu7gow51Yd00Q.jpg", overview: "Four teachers test a theory.", rating: 7.7 },
    // Too few votes to say anything.
    { tmdbId: 3, kind: "series", title: "Squid Game", year: 2021, posterPath: null, overview: null, rating: null },
    { tmdbId: 4, kind: "movie", title: "Untitled", year: null, posterPath: null, overview: null, rating: null },
  ]);
  const asked = new URL(String(tmdb.mock.calls[0][0]));
  expect([asked.pathname, asked.searchParams.get("query"), asked.searchParams.get("api_key")]).toEqual(["/3/search/multi", "druk", "test-key"]);

  // TMDB down: a clear error, not a crash.
  tmdb.mockResolvedValue(new Response("", { status: 503 }));
  expect((await call("/watch/search?q=druk", { token: anna.token })).status).toBe(502);
  tmdb.mockRestore();
  expect((await call("/watch/search?q=druk")).status).toBe(401);
});

test("details bring a movie or series' plot, rating, cast, stills and genres, in one request to TMDB", async () => {
  const anna = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();
  const tmdb = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      // Specials and a season announced for later don't count.
      seasons: [
        { season_number: 0, air_date: "2010-01-01" },
        { season_number: 1, air_date: "2010-09-26" },
        { season_number: 2, air_date: "2011-09-25" },
        { season_number: 3, air_date: "2099-01-01" },
      ],
      overview: "A prime minister.",
      vote_average: 8.06,
      vote_count: 900,
      genres: [{ id: 18, name: "Drama" }],
      original_language: "da",
      credits: { cast: [{ name: "Sidse Babett Knudsen", character: "Birgitte Nyborg", profile_path: "/a.jpg" }, { name: "Extra", character: "" }] },
      // Untagged stills first, then ones with an English title on them.
      images: { backdrops: [{ file_path: "/e.jpg", iso_639_1: "en" }, { file_path: "/b.jpg", iso_639_1: null }] },
    }),
  );
  const res = await call("/watch/details?kind=series&id=31911", { token: anna.token });
  expect(await res.json()).toEqual({
    overview: "A prime minister.",
    rating: 8.1,
    runtime: null,
    seasons: 2,
    genres: ["Drama"],
    language: "da",
    cast: [
      { name: "Sidse Babett Knudsen", character: "Birgitte Nyborg", profilePath: "/a.jpg" },
      { name: "Extra", character: null, profilePath: null },
    ],
    stills: ["/b.jpg", "/e.jpg"],
  });
  const asked = new URL(String(tmdb.mock.calls[0][0]));
  expect([asked.pathname, asked.searchParams.get("append_to_response")]).toEqual(["/3/tv/31911", "credits,images"]);
  tmdb.mockRestore();
});

test("a series being watched keeps its place, and a movie has none", async () => {
  const anna = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();
  const eve = await (await call("/households", { method: "POST", body: { name: "Eve" } })).json();
  const list = async () => (await call("/watch", { token: anna.token })).json();
  const add = async (body: object) => {
    const id = crypto.randomUUID();
    await call("/watch", { method: "POST", token: anna.token, body: { id, tmdbId: null, year: null, posterPath: null, ...body } });
    return id;
  };
  const setProgress = (id: string, progress: object | null, token = anna.token) =>
    call(`/watch/${id}/progress`, { method: "PUT", token, body: { progress } });
  const find = async (id: string) => (await list()).find((w: { id: string }) => w.id === id);

  const show = await add({ title: "Borgen", kind: "series" });
  const film = await add({ title: "Druk", kind: "movie" });
  expect(await find(show)).toMatchObject({ season: null, episode: null });

  expect((await setProgress(show, { season: 1, episode: 1 })).status).toBe(204);
  await setProgress(show, { season: 2, episode: 4 });
  expect(await find(show)).toMatchObject({ season: 2, episode: 4, progressAt: expect.any(String) });
  expect((await setProgress(show, { season: 0, episode: 1 })).status).toBe(400);
  await setProgress(show, { season: 9, episode: 9 }, eve.token); // not Eve's
  await setProgress(film, { season: 1, episode: 1 });
  expect(await find(film)).toMatchObject({ season: null, episode: null });

  // Watched and back keeps the place; Undo of a delete brings it back too.
  await call(`/watch/${show}`, { method: "PATCH", token: anna.token, body: { watched: true } });
  await call(`/watch/${show}`, { method: "PATCH", token: anna.token, body: { watched: false } });
  const before = await find(show);
  expect(before).toMatchObject({ season: 2, episode: 4 });
  await call(`/watch/${show}`, { method: "DELETE", token: anna.token });
  await call("/watch/restore", { method: "POST", token: anna.token, body: before });
  expect(await find(show)).toEqual(before);

  // Watched remembers where the series ended; Put back (place null) starts it over on its shelf.
  const patch = (id: string, body: object) => call(`/watch/${id}`, { method: "PATCH", token: anna.token, body });
  await patch(show, { watched: true, place: { season: 3, episode: 9 } });
  expect(await find(show)).toMatchObject({ watchedAt: expect.any(String), season: 3, episode: 9 });
  // Continue: back on Watching, at the new season.
  await patch(show, { watched: false, place: { season: 4, episode: 1 } });
  expect(await find(show)).toMatchObject({ watchedAt: null, season: 4, episode: 1, progressAt: expect.any(String) });
  await patch(show, { watched: true });
  await patch(show, { watched: false, place: null });
  expect(await find(show)).toMatchObject({ watchedAt: null, season: null, episode: null, progressAt: null });
  // A movie is watched, but gets no place.
  await patch(film, { watched: true, place: { season: 1, episode: 2 } });
  expect(await find(film)).toMatchObject({ watchedAt: expect.any(String), season: null, episode: null });
  await setProgress(show, { season: 2, episode: 4 });

  // Undo puts back when the place was set too, so it goes back where it was on Watching; never
  // later than now.
  const earlier = "2026-01-02T03:04:05.000Z";
  await call(`/watch/${show}/progress`, { method: "PUT", token: anna.token, body: { progress: { season: 2, episode: 3 }, at: earlier } });
  expect(await find(show)).toMatchObject({ season: 2, episode: 3, progressAt: earlier });
  await call(`/watch/${show}/progress`, { method: "PUT", token: anna.token, body: { progress: { season: 2, episode: 3 }, at: "2999-01-01T00:00:00.000Z" } });
  expect(Date.parse((await find(show)).progressAt)).toBeLessThanOrEqual(Date.now());
  await patch(show, { watched: true, place: { season: 3, episode: 9 } });
  await patch(show, { watched: false, place: { season: 2, episode: 3 }, at: earlier });
  expect(await find(show)).toMatchObject({ watchedAt: null, season: 2, episode: 3, progressAt: earlier });

  // Once watched, a tick from a phone that hadn't heard yet leaves where it ended alone.
  await patch(show, { watched: true, place: { season: 3, episode: 9 } });
  await setProgress(show, { season: 2, episode: 5 });
  expect(await find(show)).toMatchObject({ watchedAt: expect.any(String), season: 3, episode: 9 });
  await patch(show, { watched: false, place: { season: 2, episode: 4 } });

  // Stopping clears it.
  await setProgress(show, null);
  expect(await find(show)).toMatchObject({ season: null, episode: null, progressAt: null });
});

test("a series' seasons come from TMDB, without the specials", async () => {
  const anna = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();
  const tmdb = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      seasons: [
        { season_number: 2, episode_count: 8, air_date: "2020-01-01" },
        { season_number: 0, episode_count: 3, air_date: "2020-01-01" },
        { season_number: 1, episode_count: 10, air_date: "2020-01-01" },
      ],
    }),
  );
  const ask = async (ids: string) => (await call(`/watch/seasons?ids=${ids}`, { token: anna.token })).json();
  expect(await ask("1408")).toEqual({ 1408: [10, 8] });
  expect(new URL(String(tmdb.mock.calls[0][0])).pathname).toBe("/3/tv/1408");
  // Asked again soon, it's answered without TMDB.
  expect(await ask("1408")).toEqual({ 1408: [10, 8] });
  expect(tmdb).toHaveBeenCalledTimes(1);
  // Several in one go; one TMDB doesn't answer for is null, the rest still come.
  tmdb.mockResolvedValue(new Response("", { status: 404 }));
  expect(await ask("1409,1408,1409")).toEqual({ 1408: [10, 8], 1409: null });
  expect((await call("/watch/seasons?ids=0", { token: anna.token })).status).toBe(400);
  const tooMany = Array.from({ length: 101 }, (_, i) => i + 1).join(",");
  expect((await call(`/watch/seasons?ids=${tooMany}`, { token: anna.token })).status).toBe(400);
  tmdb.mockRestore();
});

test("a season's episodes come from TMDB, in order, with their stills", async () => {
  const anna = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();
  const tmdb = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      episodes: [
        { episode_number: 2, name: "Two", still_path: null },
        { episode_number: 1, name: "Pilot", still_path: "/pilot.jpg" },
      ],
    }),
  );
  const res = await call("/watch/episodes?id=1408&season=3", { token: anna.token });
  expect(await res.json()).toEqual([
    { name: "Pilot", still: "/pilot.jpg" },
    { name: "Two", still: null },
  ]);
  expect(new URL(String(tmdb.mock.calls[0][0])).pathname).toBe("/3/tv/1408/season/3");
  tmdb.mockResolvedValue(new Response("", { status: 404 }));
  expect((await call("/watch/episodes?id=1408&season=9", { token: anna.token })).status).toBe(502);
  expect((await call("/watch/episodes?id=1408&season=0", { token: anna.token })).status).toBe(400);
  tmdb.mockRestore();
});

test("a series' seasons are only what's out, and a watched end past that comes back", async () => {
  const anna = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();
  // Like Silo: season 3 airing (4 of 10 out), season 4 announced for next year, one with no date yet.
  const tmdb = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    Response.json({
      seasons: [
        { season_number: 1, episode_count: 10, air_date: "2023-05-05" },
        { season_number: 2, episode_count: 10, air_date: "2024-11-15" },
        { season_number: 3, episode_count: 10, air_date: "2026-10-01" },
        { season_number: 4, episode_count: 1, air_date: `${new Date().getFullYear() + 1}-07-01` },
        { season_number: 5, episode_count: 0, air_date: null },
      ],
      last_episode_to_air: { season_number: 3, episode_number: 4 },
    }),
  );
  const tmdbId = 800_000 + Math.floor(Math.random() * 90_000); // not kept from an earlier run
  expect(await (await call(`/watch/seasons?ids=${tmdbId}`, { token: anna.token })).json()).toEqual({ [tmdbId]: [10, 10, 4] });

  // Watched back when the announced episodes counted: its end comes back to what's out.
  const add = async (offset: number, place: { season: number; episode: number }) => {
    const id = crypto.randomUUID();
    const body = { id, title: "Silo", kind: "series", tmdbId: tmdbId + offset, year: null, posterPath: null };
    await call("/watch", { method: "POST", token: anna.token, body });
    await db.update(schema.watch).set({ watchedAt: new Date(), ...place }).where(eq(schema.watch.id, id));
    return id;
  };
  const past = await add(0, { season: 4, episode: 2 });
  const before = await add(1, { season: 2, episode: 11 }); // watched before season 3 came: left alone
  await fillEnds();
  const rows = await (await call("/watch", { token: anna.token })).json();
  expect(rows.find((w: { id: string }) => w.id === past)).toMatchObject({ season: 3, episode: 5 });
  expect(rows.find((w: { id: string }) => w.id === before)).toMatchObject({ season: 2, episode: 11 });
  tmdb.mockRestore();
});

test("a series watched without saying where it ended gets the end of its last season", async () => {
  const anna = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();
  // A new answer each time: a body can only be read once.
  const tmdb = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    Response.json({ seasons: [{ season_number: 1, episode_count: 10, air_date: "2020-01-01" }, { season_number: 2, episode_count: 8, air_date: "2020-01-01" }] }),
  );
  const add = async (tmdbId: number | null) => {
    const id = crypto.randomUUID();
    const body = { id, title: `Show ${tmdbId}`, kind: "series", tmdbId, year: null, posterPath: null };
    await call("/watch", { method: "POST", token: anna.token, body });
    return id;
  };
  const patch = (id: string, body: object) => call(`/watch/${id}`, { method: "PATCH", token: anna.token, body });
  const find = async (id: string) =>
    (await (await call("/watch", { token: anna.token })).json()).find((w: { id: string }) => w.id === id);
  const tmdbIdBase = 900_000 + Math.floor(Math.random() * 90_000); // not kept from an earlier run

  // Finished before the phone had the seasons: the server fills in the end, after answering.
  const finished = await add(tmdbIdBase);
  await call(`/watch/${finished}/progress`, { method: "PUT", token: anna.token, body: { progress: { season: 1, episode: 3 } } });
  expect((await patch(finished, { watched: true, place: null })).status).toBe(204);
  await expect.poll(() => find(finished)).toMatchObject({ season: 2, episode: 9 });

  // Watched partway without saying where it ended: the end, not the place it was at.
  const partway = await add(tmdbIdBase + 4);
  await call(`/watch/${partway}/progress`, { method: "PUT", token: anna.token, body: { progress: { season: 1, episode: 3 } } });
  expect((await patch(partway, { watched: true })).status).toBe(204);
  await expect.poll(() => find(partway)).toMatchObject({ season: 2, episode: 9 });

  // Watched before ends existed: the sweep fills it in.
  const old = await add(tmdbIdBase + 1);
  await db.update(schema.watch).set({ watchedAt: new Date() }).where(eq(schema.watch.id, old));
  await fillEnds();
  expect(await find(old)).toMatchObject({ season: 2, episode: 9 });

  // Put back before the end is filled in: it stays on its shelf, not on Watching.
  const putBack = await add(tmdbIdBase + 2);
  await db.update(schema.watch).set({ watchedAt: new Date() }).where(eq(schema.watch.id, putBack));
  let answer!: () => void;
  tmdb.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => (answer = resolve));
    return Response.json({ seasons: [{ season_number: 1, episode_count: 6, air_date: "2020-01-01" }] });
  });
  const filling = fillEnds({ id: putBack });
  await vi.waitFor(() => expect(answer).toBeTypeOf("function"));
  await patch(putBack, { watched: false, place: null });
  answer();
  await filling;
  expect(await find(putBack)).toMatchObject({ watchedAt: null, season: null, episode: null });

  // TMDB down: left as it is for the next go; typed by hand: nothing to ask.
  const down = await add(tmdbIdBase + 3);
  const byHand = await add(null);
  tmdb.mockImplementation(async () => new Response("", { status: 503 }));
  await patch(down, { watched: true });
  await patch(byHand, { watched: true });
  await fillEnds();
  expect(await find(down)).toMatchObject({ watchedAt: expect.any(String), season: null });
  expect(await find(byHand)).toMatchObject({ watchedAt: expect.any(String), season: null });
  tmdb.mockRestore();
});

test("a new season of a watched series is announced once, even with the app closed", async () => {
  const send = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
  const anna = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();
  const endpoint = `https://fcm.googleapis.com/fcm/send/${anna.deviceId}`;
  await call("/households/me/push", { method: "PUT", token: anna.token, body: { endpoint, keys: { p256dh: "k", auth: "a" } } });
  let out = 2;
  const tmdb = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    Response.json({
      seasons: Array.from({ length: out }, (_, i) => ({ season_number: i + 1, episode_count: 8, air_date: "2020-01-01" })),
    }),
  );
  const later = (hours: number) => vi.spyOn(Date, "now").mockReturnValue(Date.now() + hours * 60 * 60 * 1000); // past tmdb.ts' 6h
  const tmdbId = 700_000 + Math.floor(Math.random() * 90_000);
  const title = `Severance ${tmdbId}`;
  const id = crypto.randomUUID();
  await call("/watch", { method: "POST", token: anna.token, body: { id, title, kind: "series", tmdbId, year: null, posterPath: null } });
  // Season 2 came out after it was watched, but before this existed: not news.
  await db.update(schema.watch).set({ watchedAt: new Date(), season: 1, episode: 9 }).where(eq(schema.watch.id, id));
  const sentHere = () => send.mock.calls.filter(([, payload]) => String(payload).includes(title));

  await fillEnds();
  expect(sentHere()).toHaveLength(0);

  out = 3;
  later(7);
  await fillEnds();
  await fillEnds(); // and only once
  expect(sentHere()).toEqual([
    [
      expect.objectContaining({ endpoint }),
      JSON.stringify({ title, body: "Season 3 is out", tag: `season-${id}`, url: "/watch/watched" }),
      expect.anything(),
    ],
  ]);
  vi.mocked(Date.now).mockRestore();
  tmdb.mockRestore();
  send.mockRestore();
});

test("series finished partway before Finished meant all of it count as all of it", async () => {
  const anna = await (await call("/households", { method: "POST", body: { name: "Anna" } })).json();
  const watchedAt = new Date();
  const earlier = new Date(watchedAt.getTime() - 60_000);
  const rows = [
    // Finished partway: the place is from before it was watched.
    { tmdbId: 1, season: 3, episode: 5, progressAt: earlier },
    { tmdbId: null, season: 3, episode: 5, progressAt: earlier },
    { tmdbId: null, season: 3, episode: 1, progressAt: earlier },
    { tmdbId: null, season: 1, episode: 1, progressAt: earlier },
    // Watched with its end: left alone, even with more episodes or a new season since.
    { tmdbId: 2, season: 2, episode: 9, progressAt: watchedAt },
    { tmdbId: null, season: 2, episode: 4, progressAt: watchedAt },
  ].map((r) => ({
    ...r,
    id: crypto.randomUUID(),
    title: "Show",
    kind: "series" as const,
    watchedAt,
  }));
  const [{ householdId }] = await db.select().from(schema.devices).where(eq(schema.devices.id, anna.deviceId));
  await db.insert(schema.watch).values(rows.map((r) => ({ ...r, householdId })));

  const migration = readFileSync(new URL("../drizzle/0009_watched_all_seasons.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) await sql.unsafe(statement);

  const after = await db.select().from(schema.watch).where(eq(schema.watch.householdId, householdId));
  const placeOf = (id: string) => {
    const w = after.find((a) => a.id === id)!;
    return [w.season, w.episode];
  };
  expect(rows.map((r) => placeOf(r.id))).toEqual([
    [null, null], // the server fills it in (watched.ts)
    [4, 1],
    [3, 1],
    [null, null],
    [2, 9],
    [2, 4],
  ]);
});

test("faking a new address for each guess still runs into a cap", async () => {
  let fresh = 0;
  let status = 404;
  while (status === 404 && fresh < 1000) {
    const ip = `10.0.${Math.floor(fresh / 250)}.${fresh % 250}`;
    status = (await call("/households/check", { method: "POST", ip, body: { code: "ZZZZZZ" } })).status;
    fresh++;
  }
  expect(status).toBe(429); // on an address's very first try
  expect(fresh).toBeLessThanOrEqual(500);
});
