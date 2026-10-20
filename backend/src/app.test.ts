// Needs Postgres running: `pnpm db` from the repo root.
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, expect, test } from "vitest";
import { app } from "./app.js";
import { db, sql } from "./db/index.js";

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
