import { zValidator } from "@hono/zod-validator";
import { and, eq, isNull } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { z } from "zod";
import { auth, type Env, isMember } from "../auth.js";
import { db, schema } from "../db/index.js";
import { notify } from "../live.js";
import { complete, isTimeZone } from "../reminders.js";

const { reminders } = schema;

const reminderFields = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000),
  remindAt: z.iso.datetime().nullable(),
  repeat: z.enum(["day", "week", "month"]).nullable(),
  // Who it's for, or null for everyone.
  forDevice: z.uuid().nullable(),
  timeZone: z.string().max(64).refine(isTimeZone, "Unknown time zone"),
});
const reminderParam = zValidator("param", z.object({ id: z.uuid() }));
// Where a reminder stands, for Undo.
const reminderTimes = z.object({
  remindAt: z.iso.datetime().nullable(),
  snoozedUntil: z.iso.datetime().nullable(),
  done: z.boolean(),
});
const NOT_A_MEMBER = "That phone isn't in your household.";
const NO_REMINDER = "That reminder is gone.";
const CHANGED_SINCE = "Someone changed that reminder since.";

export const reminderRoutes = new Hono<Env>()
  .use(auth)
  .get("/", async (c) => {
    const rows = await db
      .select()
      .from(reminders)
      .where(eq(reminders.householdId, c.var.householdId))
      .orderBy(reminders.createdAt);
    return c.json(rows);
  })
  .post("/", zValidator("json", reminderFields.extend({ id: z.uuid() })), async (c) => {
    const { remindAt, ...rest } = c.req.valid("json");
    if (rest.forDevice && !(await isMember(c.var.householdId, rest.forDevice))) return c.json({ error: NOT_A_MEMBER }, 400);
    await db
      .insert(reminders)
      .values({
        ...rest,
        remindAt: remindAt ? new Date(remindAt) : null,
        householdId: c.var.householdId,
        createdBy: c.var.deviceId,
      })
      .onConflictDoNothing(); // a retried request
    notify(c.var.householdId, "reminders");
    return c.body(null, 204);
  })
  // Edit, snooze, or put back from Done. A new time sends it again when that comes.
  .patch(
    "/:id",
    reminderParam,
    zValidator("json", reminderFields.extend({ snoozedUntil: z.iso.datetime(), done: z.literal(false) }).partial()),
    async (c) => {
      const { remindAt, snoozedUntil, ...rest } = c.req.valid("json");
      if (rest.forDevice && !(await isMember(c.var.householdId, rest.forDevice))) return c.json({ error: NOT_A_MEMBER }, 400);
      const changes = {
        ...rest,
        ...(remindAt !== undefined && { remindAt: remindAt ? new Date(remindAt) : null, snoozedUntil: null, notified: false }),
        ...(snoozedUntil && { snoozedUntil: new Date(snoozedUntil), notified: false }),
      };
      if (Object.keys(changes).length) {
        await db
          .update(reminders)
          .set(changes)
          .where(and(eq(reminders.id, c.req.valid("param").id), eq(reminders.householdId, c.var.householdId)));
      }
      notify(c.var.householdId, "reminders");
      return c.body(null, 204);
    },
  )
  // Answers with its times as they are now, so an Undo can tell whether anything changed it since.
  .post("/:id/done", reminderParam, async (c) => {
    const now = await complete(c.var.householdId, c.req.valid("param").id);
    if (!now) return c.json({ error: NO_REMINDER }, 404);
    notify(c.var.householdId, "reminders");
    return c.json(now);
  })
  // Undo of Done or Snooze: puts it back exactly as it was. Still sent, so it's due again without buzzing again.
  // Only while it's as this phone left it (`ifStill`): a change from another phone since then wins.
  .put(
    "/:id/state",
    reminderParam,
    zValidator("json", reminderTimes.extend({ notified: z.boolean(), ifStill: reminderTimes })),
    async (c) => {
      const { remindAt, snoozedUntil, ifStill, ...rest } = c.req.valid("json");
      const when = (iso: string | null) => (iso ? new Date(iso) : null);
      const is = (column: PgColumn, iso: string | null) => (iso ? eq(column, new Date(iso)) : isNull(column));
      const restored = await db
        .update(reminders)
        .set({ ...rest, remindAt: when(remindAt), snoozedUntil: when(snoozedUntil) })
        .where(
          and(
            eq(reminders.id, c.req.valid("param").id),
            eq(reminders.householdId, c.var.householdId),
            is(reminders.remindAt, ifStill.remindAt),
            is(reminders.snoozedUntil, ifStill.snoozedUntil),
            eq(reminders.done, ifStill.done),
          ),
        )
        .returning({ id: reminders.id });
      if (!restored.length) return c.json({ error: CHANGED_SINCE }, 409);
      notify(c.var.householdId, "reminders");
      return c.body(null, 204);
    },
  )
  // Registered before "/:id" so "done" isn't read as an id.
  .delete("/done", async (c) => {
    await db.delete(reminders).where(and(eq(reminders.householdId, c.var.householdId), eq(reminders.done, true)));
    notify(c.var.householdId, "reminders");
    return c.body(null, 204);
  })
  .delete("/:id", reminderParam, async (c) => {
    await db
      .delete(reminders)
      .where(and(eq(reminders.id, c.req.valid("param").id), eq(reminders.householdId, c.var.householdId)));
    notify(c.var.householdId, "reminders");
    return c.body(null, 204);
  });
