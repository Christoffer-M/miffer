import { randomBytes, randomInt } from "node:crypto";
import { getConnInfo } from "@hono/node-server/conninfo";
import { zValidator } from "@hono/zod-validator";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { auth, type Env, hashToken } from "../auth.js";
import { db, schema } from "../db/index.js";
import { notify } from "../live.js";
import { isPushEndpoint, pushKey } from "../push.js";

const { households, devices, linkCodes } = schema;

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

const newToken = () => randomBytes(32).toString("base64url");
const newCode = () =>
  Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");

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

export const householdRoutes = new Hono<Env>()
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
    const members = rows.map(({ id, name, pushOn }) => ({ id, name, pushOn }));
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
