import { createHash, randomBytes, randomInt } from "node:crypto";
import { getConnInfo } from "@hono/node-server/conninfo";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gt, lte, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { db, schema } from "./db/index.js";
import { notify } from "./live.js";
import { isPushEndpoint, pushAdded, pushKey } from "./push.js";

const { households, devices, items, itemHistory, linkCodes } = schema;

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I mix-ups
const CODE_TTL_MS = 24 * 60 * 60 * 1000; // long enough for an invite link to sit in a chat

// A code lives a day, so guessing one must stay slow: each address gets a few tries per window,
// and everyone together gets a cap too, so faking addresses doesn't buy more guesses.
const JOIN_TRIES = 10;
const JOIN_TRIES_TOTAL = 500;
const JOIN_WINDOW_MS = 15 * 60 * 1000;
const joinTries = new Map<string, number>(); // never more than JOIN_TRIES_TOTAL addresses
let joinTriesTotal = 0;
let joinWindowEnds = 0;

/** Counts a join attempt from this address; false once it or everyone has used up the tries for now. */
function allowJoin(address: string) {
  if (Date.now() >= joinWindowEnds) {
    joinTries.clear();
    joinTriesTotal = 0;
    joinWindowEnds = Date.now() + JOIN_WINDOW_MS;
  }
  const tries = (joinTries.get(address) ?? 0) + 1;
  if (tries > JOIN_TRIES || joinTriesTotal >= JOIN_TRIES_TOTAL) return false;
  joinTries.set(address, tries);
  joinTriesTotal++;
  return true;
}

// Behind nginx-proxy (TRUST_PROXY set), X-Real-IP is the caller's address. Anywhere else the
// header is whatever the caller sent, so the socket's address is used instead.
function clientAddress(c: Context) {
  const real = process.env.TRUST_PROXY ? c.req.header("X-Real-IP") : undefined;
  if (real) return real;
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown"; // app.request() in tests has no socket
  }
}

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

/** A new code for linking one more phone, alongside any others still out. */
async function addCode(householdId: string) {
  const code = newCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await db.delete(linkCodes).where(lte(linkCodes.expiresAt, new Date())); // tidy up while we're here
  await db.insert(linkCodes).values({ code, householdId, expiresAt });
  return { code, expiresAt };
}

const name = z.string().trim().min(1).max(40);
const linkCode = z.string().trim().toUpperCase().length(6);
const WRONG_CODE = "That code is wrong or has expired.";

// Checking and joining share one budget, so checking isn't a faster way to guess.
const joinLimit = createMiddleware(async (c, next) => {
  if (!allowJoin(clientAddress(c))) return c.json({ error: "Too many tries. Wait a few minutes and try again." }, 429);
  await next();
});

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
    const [household] = await db.insert(households).values({}).returning({ id: households.id });
    const linked = await addDevice(household.id, c.req.valid("json").name);
    const { code } = await addCode(household.id);
    return c.json({ ...linked, code }, 201);
  })
  // Whether a code would link up right now, so a typo shows before the name screen. Doesn't use it up.
  .post("/check", joinLimit, zValidator("json", z.object({ code: linkCode })), async (c) => {
    const [found] = await db
      .select({ code: linkCodes.code })
      .from(linkCodes)
      .where(and(eq(linkCodes.code, c.req.valid("json").code), gt(linkCodes.expiresAt, new Date())));
    return found ? c.body(null, 204) : c.json({ error: WRONG_CODE }, 404);
  })
  // "Link up": trade a valid code for a token in the same household. Codes are single-use.
  .post(
    "/join",
    joinLimit,
    zValidator("json", z.object({ code: linkCode, name })),
    async (c) => {
      const { code, name } = c.req.valid("json");
      const [used] = await db
        .delete(linkCodes)
        .where(and(eq(linkCodes.code, code), gt(linkCodes.expiresAt, new Date())))
        .returning({ householdId: linkCodes.householdId });
      if (!used) return c.json({ error: WRONG_CODE }, 404);
      const linked = await addDevice(used.householdId, name);
      notify(used.householdId, "members");
      return c.json(linked, 201);
    },
  )
  // This phone's id, everyone in the household (oldest first), and its notification setup.
  .get("/me", auth, async (c) => {
    const rows = await db
      .select({ id: devices.id, name: devices.name, pushOn: sql<boolean>`${devices.push} is not null` })
      .from(devices)
      .where(eq(devices.householdId, c.var.householdId))
      .orderBy(devices.createdAt);
    const members = rows.map(({ id, name }) => ({ id, name }));
    const pushOn = rows.find((r) => r.id === c.var.deviceId)?.pushOn ?? false;
    return c.json({ deviceId: c.var.deviceId, members, pushKey, pushOn });
  })
  // Turn notifications on for this phone, with the browser's PushSubscription...
  .put(
    "/me/push",
    auth,
    zValidator(
      "json",
      z.object({
        endpoint: z.url().max(1000).refine(isPushEndpoint, "Not a push service"),
        keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
      }),
    ),
    async (c) => {
      const { endpoint, keys } = c.req.valid("json");
      await db.update(devices).set({ push: { endpoint, keys } }).where(eq(devices.id, c.var.deviceId));
      return c.body(null, 204);
    },
  )
  // ...or off.
  .delete("/me/push", auth, async (c) => {
    await db.update(devices).set({ push: null }).where(eq(devices.id, c.var.deviceId));
    return c.body(null, 204);
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
  // A fresh code for linking another phone. Codes handed out earlier keep working.
  .post("/code", auth, async (c) => {
    const { code, expiresAt } = await addCode(c.var.householdId);
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
  // What this household has added before, most often first: the suggestions.
  .get("/history", async (c) => {
    const rows = await db
      .select({ name: itemHistory.name, count: itemHistory.count, lastAddedAt: itemHistory.lastAddedAt })
      .from(itemHistory)
      .where(eq(itemHistory.householdId, c.var.householdId))
      .orderBy(desc(itemHistory.count), desc(itemHistory.lastAddedAt));
    return c.json(rows);
  })
  .post(
    "/",
    zValidator("json", z.object({ id: z.uuid(), name: z.string().trim().min(1).max(200) })),
    async (c) => {
      const { id, name } = c.req.valid("json");
      const added = await db
        .insert(items)
        .values({ id, name, householdId: c.var.householdId, addedBy: c.var.deviceId })
        .onConflictDoNothing() // a retried request is fine...
        .returning({ id: items.id });
      // ...and isn't counted twice.
      if (added.length) {
        await db
          .insert(itemHistory)
          .values({ householdId: c.var.householdId, key: name.toLocaleLowerCase("da"), name })
          .onConflictDoUpdate({
            target: [itemHistory.householdId, itemHistory.key],
            set: { name, count: sql`${itemHistory.count} + 1`, lastAddedAt: new Date() },
          });
        // Not awaited: a slow push service shouldn't hold up adding.
        pushAdded(c.var.householdId, c.var.deviceId, name).catch((err) => console.error("push failed", err));
      }
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
