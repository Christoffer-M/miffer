import { and, eq, isNotNull, lte, sql } from "drizzle-orm";
import { db, schema, sql as pg } from "./db/index.js";
import { notify } from "./live.js";
import { pushReminder } from "./push.js";

const { reminders } = schema;

let zoneNames: Promise<Set<string>> | undefined;
/**
 * Only time zone names Postgres knows, since it does the repeat maths. JavaScript's own check
 * isn't enough: it also takes offsets like "+01:00", which Postgres reads the other way round.
 */
export async function isTimeZone(name: string) {
  zoneNames ??= pg<{ name: string }[]>`select name from pg_timezone_names`
    .then((rows) => new Set(rows.map((r) => r.name)))
    .catch((err) => {
      zoneNames = undefined; // ask again next time
      throw err;
    });
  return (await zoneNames).has(name);
}

const repeats = sql`(${reminders.repeat} is not null and ${reminders.remindAt} is not null)`;
const step = sql`case ${reminders.repeat} when 'day' then interval '1 day' when 'week' then interval '7 days' else interval '1 month' end`;
const local = (t: unknown) => sql`(${t} at time zone ${reminders.timeZone})`;
// Repeats step on the wall clock in the reminder's time zone, so a daily 18:00 stays 18:00 across
// summer time. ponytail: months step from the last time, not the first, so the 31st drifts to the
// 28th after February; keep the first time too if that matters.
// `until` is wall-clock time already.
const series = (until: unknown) => sql`generate_series(${local(reminders.remindAt)}, ${until}, ${step}) t`;
// The first repeat after now, or after its time when it's ticked off early.
const after = sql`greatest(now(), ${reminders.remindAt})`;
const nextTime = sql`(select t at time zone ${reminders.timeZone} from ${series(sql`${local(after)} + ${step}`)}
  where t at time zone ${reminders.timeZone} > ${after} order by t limit 1)`;
// The last repeat at or before now: where a repeating reminder that has come round is due from.
const lastTime = sql`((select max(t) from ${series(local(sql`now()`))}) at time zone ${reminders.timeZone})`;

/**
 * Ticks a reminder off. A repeating one isn't done: it moves on to its next time instead.
 * Returns its times as they are now, or nothing if there's no such reminder.
 */
export async function complete(householdId: string, id: string) {
  const [row] = await db
    .update(reminders)
    .set({
      done: sql`not ${repeats}`,
      remindAt: sql`case when ${repeats} then ${nextTime} else ${reminders.remindAt} end`,
      snoozedUntil: null,
      notified: sql`${reminders.notified} and not ${repeats}`,
    })
    .where(and(eq(reminders.id, id), eq(reminders.householdId, householdId)))
    .returning({ remindAt: reminders.remindAt, snoozedUntil: reminders.snoozedUntil, done: reminders.done });
  return row;
}

/** Sends every reminder that has come due, each once: marking it sent and picking it up is one statement. */
export async function fireDue() {
  // A repeating reminder nobody ticked off (say it was done without opening the app) still comes
  // round again: once its next time has passed it waits to be sent like a new one.
  await db
    .update(reminders)
    .set({ remindAt: lastTime, snoozedUntil: null, notified: false })
    .where(
      and(
        eq(reminders.notified, true),
        eq(reminders.done, false),
        isNotNull(reminders.repeat),
        lte(sql`(${local(reminders.remindAt)} + ${step}) at time zone ${reminders.timeZone}`, sql`now()`),
      ),
    );

  const due = await db
    .update(reminders)
    .set({
      notified: true,
      // A repeating one that's long overdue (the server was down, or it was set in the past) is
      // due from its latest time, so it isn't sent again straight after for each one it missed.
      remindAt: sql`case when ${repeats} and ${reminders.remindAt} <= now() then ${lastTime} else ${reminders.remindAt} end`,
    })
    .where(
      and(
        eq(reminders.notified, false),
        eq(reminders.done, false),
        lte(sql`coalesce(${reminders.snoozedUntil}, ${reminders.remindAt})`, sql`now()`),
      ),
    )
    .returning();
  new Set(due.map((r) => r.householdId)).forEach((h) => notify(h, "reminders"));
  await Promise.all(
    due.map((r) =>
      pushReminder(r).catch(async (err) => {
        // Not sent after all (each phone's own failures are handled in push.ts): try again next time.
        console.error("reminder push failed", err);
        await db.update(reminders).set({ notified: false }).where(eq(reminders.id, r.id));
      }),
    ),
  );
}
