import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { db, schema } from "./db/index.js";

const { devices } = schema;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function deviceForToken(token: string) {
  const [device] = await db.select().from(devices).where(eq(devices.tokenHash, hashToken(token)));
  return device;
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

export const isMember = async (householdId: string, deviceId: string) =>
  (
    await db
      .select({ id: devices.id })
      .from(devices)
      .where(and(eq(devices.id, deviceId), eq(devices.householdId, householdId)))
  ).length > 0;
