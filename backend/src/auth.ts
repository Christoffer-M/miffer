import { createHash, randomBytes } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { db, schema } from "./db/index.js";

const { devices } = schema;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

export async function deviceForToken(token: string) {
  const [device] = await db.select().from(devices).where(eq(devices.tokenHash, hashToken(token)));
  return device;
}

export async function addDevice(householdId: string, name: string) {
  const token = newToken();
  const [device] = await db
    .insert(devices)
    .values({ householdId, name, tokenHash: hashToken(token) })
    .returning({ id: devices.id });
  return { token, deviceId: device.id };
}

export type Env = { Variables: { deviceId: string; householdId: string } };

export const auth = createMiddleware<Env>(async (c, next) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer /, "");
  const device = token ? await deviceForToken(token) : undefined;
  if (!device) return c.json({ error: "unauthorized" }, 401);
  c.set("deviceId", device.id);
  c.set("householdId", device.householdId);
  await next();
});

// The `:id` of a household's row: a member, item, reminder or watch title.
export const idParam = zValidator("param", z.object({ id: z.uuid() }));

export const isMember = async (householdId: string, deviceId: string) =>
  (
    await db
      .select({ id: devices.id })
      .from(devices)
      .where(and(eq(devices.id, deviceId), eq(devices.householdId, householdId)))
  ).length > 0;
