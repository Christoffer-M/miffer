// Needs Postgres running: `pnpm db` from the repo root.
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, expect, test } from "vitest";
import { app } from "./app.js";
import { db, sql } from "./db/index.js";

beforeAll(() => migrate(db, { migrationsFolder: "./drizzle" }));
afterAll(() => sql.end());

function call(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  return app.request(`/api${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token && { Authorization: `Bearer ${opts.token}` }),
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
