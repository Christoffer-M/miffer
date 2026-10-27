// Needs Postgres running: `pnpm db` from the repo root.
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import webpush from "web-push";
import { app } from "./app.js";
import { eq, sql as q } from "drizzle-orm";
import { db, schema, sql } from "./db/index.js";
import { fireDue } from "./reminders.js";

// A throwaway key pair, only so push.ts turns notifications on. Set before it's imported.
vi.hoisted(() => {
  process.env.VAPID_PUBLIC_KEY =
    "BFboTDHfxJXoeI1Mo01jA5MgTUCTTaw3TMVQjedY42rtMqYpvBlbBKasuxQxuGBZKjPpgqXdxGo8OU1MS-_-6rA";
  process.env.VAPID_PRIVATE_KEY = "r5JiyoGcuNrkZVAvQYcPfsC-rfXROnsF1Nl61-hGyXA";
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
