import { and, eq, lte, sql } from "drizzle-orm";
import { db, schema } from "./db/index.js";
import { notify } from "./live.js";
import { pushReminder } from "./push.js";

const { reminders } = schema;

const repeats = sql`(${reminders.repeat} is not null and ${reminders.remindAt} is not null)`;
const step = sql`case ${reminders.repeat} when 'day' then interval '1 day' when 'week' then interval '7 days' else interval '1 month' end`;
const local = (t: unknown) => sql`(${t} at time zone ${reminders.timeZone})`;
// The first repeat after now (or after its time, when it's ticked off early), stepping on the wall
// clock in the reminder's time zone, so a daily 18:00 stays 18:00 across summer time.
// ponytail: months step from the last time, not the first, so the 31st drifts to the 28th after
// February; keep the first time too if that matters.
const after = sql`greatest(now(), ${reminders.remindAt})`;
const nextTime = sql`(select t at time zone ${reminders.timeZone}
  from generate_series(${local(reminders.remindAt)}, ${local(after)} + ${step}, ${step}) t
  where t at time zone ${reminders.timeZone} > ${after} order by t limit 1)`;

/** Ticks a reminder off. A repeating one isn't done: it moves on to its next time instead. */
export async function complete(householdId: string, id: string) {
  await db
    .update(reminders)
    .set({
      done: sql`not ${repeats}`,
      remindAt: sql`case when ${repeats} then ${nextTime} else ${reminders.remindAt} end`,
      snoozedUntil: null,
      notified: sql`${reminders.notified} and not ${repeats}`,
    })
    .where(and(eq(reminders.id, id), eq(reminders.householdId, householdId)));
}

/** Sends every reminder that has come due, each once: marking it sent and picking it up is one statement. */
export async function fireDue() {
  const due = await db
    .update(reminders)
    .set({ notified: true })
    .where(
      and(
        eq(reminders.notified, false),
        eq(reminders.done, false),
        lte(sql`coalesce(${reminders.snoozedUntil}, ${reminders.remindAt})`, sql`now()`),
      ),
    )
    .returning();
  new Set(due.map((r) => r.householdId)).forEach((h) => notify(h, "reminders"));
  await Promise.all(due.map(pushReminder));
}
