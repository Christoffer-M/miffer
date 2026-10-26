import assert from "node:assert/strict";
import { test } from "node:test";
import { formatWhen, quickTimes, sortReminders, toLocalInput } from "./reminders.ts";

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
