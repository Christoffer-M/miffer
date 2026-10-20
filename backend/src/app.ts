import { createHash, randomBytes, randomInt } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { db, schema } from "./db/index.js";
import { notify } from "./live.js";

const { households, devices, items } = schema;

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I mix-ups
const CODE_TTL_MS = 10 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const newCode = () =>
  Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");

export async function deviceForToken(token: string) {
  const [device] = await db.select().from(devices).where(eq(devices.tokenHash, hashToken(token)));
  return device;
}

async function addDevice(householdId: string, name: string) {
  const token = newToken();
  const [device] = await db
    .insert(devices)
    .values({ householdId, name, tokenHash: hashToken(token) })
    .returning({ id: devices.id });
  return { token, deviceId: device.id };
}

const name = z.string().trim().min(1).max(40);

type Env = { Variables: { deviceId: string; householdId: string } };

const auth = createMiddleware<Env>(async (c, next) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer /, "");
  const device = token ? await deviceForToken(token) : undefined;
  if (!device) return c.json({ error: "unauthorized" }, 401);
  c.set("deviceId", device.id);
  c.set("householdId", device.householdId);
  await next();
});

const householdRoutes = new Hono<Env>()
  // "Start fresh": a new household, this phone's token and a code to share.
  .post("/", zValidator("json", z.object({ name })), async (c) => {
    const code = newCode();
    const [household] = await db
      .insert(households)
      .values({ linkCode: code, linkCodeExpiresAt: new Date(Date.now() + CODE_TTL_MS) })
      .returning({ id: households.id });
    return c.json({ ...(await addDevice(household.id, c.req.valid("json").name)), code }, 201);
  })
  // "Link up": trade a valid code for a token in the same household. Codes are single-use.
  .post(
    "/join",
    zValidator("json", z.object({ code: z.string().trim().toUpperCase().length(6), name })),
    async (c) => {
      const { code, name } = c.req.valid("json");
      const [household] = await db
        .update(households)
        .set({ linkCode: null, linkCodeExpiresAt: null })
        .where(and(eq(households.linkCode, code), gt(households.linkCodeExpiresAt, new Date())))
        .returning({ id: households.id });
      if (!household) return c.json({ error: "That code is wrong or has expired." }, 404);
      const linked = await addDevice(household.id, name);
      notify(household.id, "members");
      return c.json(linked, 201);
    },
  )
  // This phone's id and everyone in the household, oldest first.
  .get("/me", auth, async (c) => {
    const members = await db
      .select({ id: devices.id, name: devices.name })
      .from(devices)
      .where(eq(devices.householdId, c.var.householdId))
      .orderBy(devices.createdAt);
    return c.json({ deviceId: c.var.deviceId, members });
  })
  // Change this phone's name; everyone's member list updates live.
  .patch("/me", auth, zValidator("json", z.object({ name })), async (c) => {
    await db.update(devices).set({ name: c.req.valid("json").name }).where(eq(devices.id, c.var.deviceId));
    notify(c.var.householdId, "members");
    return c.body(null, 204);
  })
  // Removing a phone revokes its token right away. Removing yourself is "leave".
  .delete("/members/:id", auth, zValidator("param", z.object({ id: z.uuid() })), async (c) => {
    await db
      .delete(devices)
      .where(and(eq(devices.id, c.req.valid("param").id), eq(devices.householdId, c.var.householdId)));
    notify(c.var.householdId, "members");
    return c.body(null, 204);
  })
  // A fresh code for linking another phone.
  .post("/code", auth, async (c) => {
    const code = newCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await db
      .update(households)
      .set({ linkCode: code, linkCodeExpiresAt: expiresAt })
      .where(eq(households.id, c.var.householdId));
    return c.json({ code, expiresAt: expiresAt.toISOString() });
  });

const itemParam = zValidator("param", z.object({ id: z.uuid() }));

const itemRoutes = new Hono<Env>()
  .use(auth)
  .get("/", async (c) => {
    const rows = await db
      .select()
      .from(items)
      .where(eq(items.householdId, c.var.householdId))
      .orderBy(desc(items.createdAt));
    return c.json(rows);
  })
  .post(
    "/",
    zValidator("json", z.object({ id: z.uuid(), name: z.string().trim().min(1).max(200) })),
    async (c) => {
      const { id, name } = c.req.valid("json");
      await db
        .insert(items)
        .values({ id, name, householdId: c.var.householdId, addedBy: c.var.deviceId })
        .onConflictDoNothing(); // a retried request is fine
      notify(c.var.householdId);
      return c.body(null, 204);
    },
  )
  .patch("/:id", itemParam, zValidator("json", z.object({ done: z.boolean() })), async (c) => {
    await db
      .update(items)
      .set({ done: c.req.valid("json").done, updatedAt: new Date() })
      .where(and(eq(items.id, c.req.valid("param").id), eq(items.householdId, c.var.householdId)));
    notify(c.var.householdId);
    return c.body(null, 204);
  })
  // Registered before "/:id" so "done" isn't read as an id.
  .delete("/done", async (c) => {
    await db
      .delete(items)
      .where(and(eq(items.householdId, c.var.householdId), eq(items.done, true)));
    notify(c.var.householdId);
    return c.body(null, 204);
  })
  .delete("/:id", itemParam, async (c) => {
    await db
      .delete(items)
      .where(and(eq(items.id, c.req.valid("param").id), eq(items.householdId, c.var.householdId)));
    notify(c.var.householdId);
    return c.body(null, 204);
  });

export const app = new Hono()
  .basePath("/api")
  .get("/health", (c) => c.text("ok"))
  .route("/households", householdRoutes)
  .route("/items", itemRoutes);

export type AppType = typeof app;
