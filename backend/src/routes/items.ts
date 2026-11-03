import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { auth, type Env, idParam } from "../auth.js";
import { db, schema } from "../db/index.js";
import { notify } from "../live.js";
import { pushAdded } from "../push.js";

const { devices, items, itemHistory } = schema;


export const itemRoutes = new Hono<Env>()
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
  // Undo: puts removed items back as they were, with the same tick, who added them and place in
  // the list. It isn't a new add, so suggestions don't count it.
  .post(
    "/restore",
    zValidator(
      "json",
      z
        .array(
          z.object({
            id: z.uuid(),
            name: z.string().trim().min(1).max(200),
            done: z.boolean(),
            addedBy: z.uuid().nullable(),
            createdAt: z.iso.datetime(),
          }),
        )
        .min(1)
        .max(500),
    ),
    async (c) => {
      // Only someone in this household can have added it; anyone else (or a phone removed since) is dropped.
      const members = await db
        .select({ id: devices.id })
        .from(devices)
        .where(eq(devices.householdId, c.var.householdId));
      const member = new Set(members.map((m) => m.id));
      await db
        .insert(items)
        .values(
          c.req.valid("json").map((i) => ({
            ...i,
            householdId: c.var.householdId,
            addedBy: i.addedBy && member.has(i.addedBy) ? i.addedBy : null,
            createdAt: new Date(i.createdAt),
          })),
        )
        .onConflictDoNothing(); // already back (a retry), or someone else's id: left as it is
      notify(c.var.householdId);
      return c.body(null, 204);
    },
  )
  .patch("/:id", idParam, zValidator("json", z.object({ done: z.boolean() })), async (c) => {
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
  .delete("/:id", idParam, async (c) => {
    await db
      .delete(items)
      .where(and(eq(items.id, c.req.valid("param").id), eq(items.householdId, c.var.householdId)));
    notify(c.var.householdId);
    return c.body(null, 204);
  });
