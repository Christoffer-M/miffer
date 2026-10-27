import assert from "node:assert/strict";
import { test } from "node:test";
import { dueFor, formatBack, formatDue, formatWhen, nextTime, quickTimes, sortReminders, toLocalInput } from "./reminders.ts";

// Local times, so the tests pass in any time zone. 26 Oct 2026 is a Monday.
const now = new Date(2026, 9, 26, 12, 30, 45);

test("times read like people say them", () => {
  assert.equal(formatWhen(new Date(2026, 9, 26, 18), now), "Today 18:00");
  assert.equal(formatWhen(new Date(2026, 9, 27, 9), now), "Tomorrow 09:00");
  assert.equal(formatWhen(new Date(2026, 9, 25, 9), now), "Yesterday 09:00");
  assert.equal(formatWhen(new Date(2026, 9, 29, 17, 30), now), "Thu 17:30");
  assert.equal(formatWhen(new Date(2026, 10, 2, 9), now), "2 Nov 09:00");
});

test("quick picks: in an hour on the minute, tonight only before five", () => {
  assert.deepEqual(
    quickTimes(now).map((q) => [q.label, toLocalInput(q.at)]),
    [
      ["In 1 hour", "2026-10-26T13:30"],
      ["Tonight 18:00", "2026-10-26T18:00"],
      ["Tomorrow 09:00", "2026-10-27T09:00"],
    ],
  );
  assert.deepEqual(quickTimes(new Date(2026, 9, 26, 17, 15)).map((q) => q.label), ["In 1 hour", "Tomorrow 09:00"]);
});

test("due, then coming up soonest first with snoozes counted, then done", () => {
  const r = (id: string, o: object) => ({ id, done: false, notified: false, remindAt: null, snoozedUntil: null, createdAt: "2026-10-01", ...o });
  const { due, upcoming, done } = sortReminders([
    r("no time", {}),
    r("thursday", { remindAt: "2026-10-29T16:00:00Z" }),
    r("snoozed", { remindAt: "2026-10-26T10:00:00Z", snoozedUntil: "2026-10-28T08:00:00Z" }),
    r("due", { remindAt: "2026-10-26T10:00:00Z", notified: true }),
    r("finished", { done: true, notified: true }),
  ]);
  assert.deepEqual(due.map((x) => x.id), ["due"]);
  assert.deepEqual(upcoming.map((x) => x.id), ["snoozed", "thursday", "no time"]);
  assert.deepEqual(done.map((x) => x.id), ["finished"]);
});

test("the popup: what's due for this phone or everyone, a tapped one first", () => {
  const r = (id: string, forDevice: string | null, remindAt: string) =>
    ({ id, forDevice, remindAt, done: false, notified: true, snoozedUntil: null, createdAt: "2026-10-01" });
  const list = [
    r("mine", "me", "2026-10-26T09:00:00Z"),
    r("theirs", "them", "2026-10-26T08:00:00Z"),
    r("everyone", null, "2026-10-26T10:00:00Z"),
    { ...r("waiting", "me", "2026-10-27T10:00:00Z"), notified: false },
  ];
  assert.deepEqual(dueFor(list, "me").map((x) => x.id), ["mine", "everyone"]);
  assert.deepEqual(dueFor(list, "me", "everyone").map((x) => x.id), ["everyone", "mine"]);
  assert.deepEqual(dueFor(list, "me", "theirs").map((x) => x.id), ["mine", "everyone"]);
});

test("back again: at a time today, else the day", () => {
  assert.equal(formatBack(new Date(2026, 9, 26, 13, 17), now), "at 13:17");
  assert.equal(formatBack(new Date(2026, 9, 27, 9), now), "tomorrow 09:00");
  assert.equal(formatBack(new Date(2026, 9, 29, 17, 30), now), "Thu 17:30");
  assert.equal(formatDue(new Date(2026, 9, 26, 9), now), "09:00");
  assert.equal(formatDue(new Date(2026, 9, 25, 18), now), "Yesterday 18:00");
});

test("the next repeat: after now, or after its time when ticked off early", () => {
  const local = (d: Date) => toLocalInput(d);
  // Last Monday at 18:00, weekly: today at 18:00, still ahead at 12:30.
  assert.equal(local(nextTime(new Date(2026, 9, 19, 18), "week", now)), "2026-10-26T18:00");
  // Daily, due tomorrow but ticked off today: the day after.
  assert.equal(local(nextTime(new Date(2026, 9, 27, 9), "day", now)), "2026-10-28T09:00");
  // Monthly on the 31st: the last day of a short month.
  assert.equal(local(nextTime(new Date(2026, 9, 31, 9), "month", now)), "2026-11-30T09:00");
});
