// Times and order for the Reminders screen. No React here, so Node can test it straight.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

type Times = { done: boolean; notified: boolean; remindAt: string | null; snoozedUntil: string | null; createdAt: string };

export const REPEATS = { day: "daily", week: "weekly", month: "monthly" } as const;

/** When it nudges next: the snooze if there is one, else its own time. */
export const dueAt = (r: Times) => r.snoozedUntil ?? r.remindAt;

/** Due (sent and waiting), coming up (soonest first, no time last) and done. */
export function sortReminders<R extends Times>(list: R[]) {
  const byTime = (a: R, b: R) =>
    (dueAt(a) ?? "9999").localeCompare(dueAt(b) ?? "9999") || a.createdAt.localeCompare(b.createdAt);
  return {
    due: list.filter((r) => !r.done && r.notified).sort(byTime),
    upcoming: list.filter((r) => !r.done && !r.notified).sort(byTime),
    done: list.filter((r) => r.done),
  };
}

/** What's due for this phone (for it or for everyone), oldest first, with `first` (a tapped notification's) ahead. */
export function dueFor<R extends Times & { id: string; forDevice: string | null }>(
  list: R[],
  deviceId: string,
  first?: string | null,
) {
  const due = sortReminders(list).due.filter((r) => !r.forDevice || r.forDevice === deviceId);
  return [...due.filter((r) => r.id === first), ...due.filter((r) => r.id !== first)];
}

export const clock = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const at = (from: Date, days: number, hour: number) =>
  new Date(from.getFullYear(), from.getMonth(), from.getDate() + days, hour);

/** The day and time, with `near` as the words for yesterday, today and tomorrow. */
function withDay(when: Date, now: Date, near: [string, string, string]) {
  // Rounded: a day with a clock change is 23 or 25 hours long.
  const days = Math.round((day(when) - day(now)) / (24 * HOUR));
  const date =
    Math.abs(days) <= 1 ? near[days + 1]
    : days > 1 && days < 7 ? when.toLocaleDateString("en-GB", { weekday: "short" })
    : when.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${date} ${clock(when)}`.trim();
}

/** "Today 18:00", "Tomorrow 09:00", "Thu 17:30" within the week, else "1 Nov 09:00". */
export const formatWhen = (when: Date, now = new Date()) => withDay(when, now, ["Yesterday", "Today", "Tomorrow"]);

/** For "back …": "at 13:17" today, "tomorrow 09:00", "Thu 17:30". */
export const formatBack = (when: Date, now = new Date()) => withDay(when, now, ["yesterday", "at", "tomorrow"]);

/** For "Due · …": just the time today, "13:17", else "Yesterday 18:00", "Thu 17:30". */
export const formatDue = (when: Date, now = new Date()) => withDay(when, now, ["Yesterday", "", "Tomorrow"]);

/** Now plus some minutes, on the minute. */
const later = (now: Date, minutes: number) => new Date(Math.floor(now.getTime() / MINUTE) * MINUTE + minutes * MINUTE);

/** The quick picks when setting a time. Tonight only while it's still a while off. */
export const quickTimes = (now = new Date()) => [
  { label: "In 1 hour", at: later(now, 60) },
  ...(now.getHours() < 17 ? [{ label: "Tonight 18:00", at: at(now, 0, 18) }] : []),
  { label: "Tomorrow 09:00", at: at(now, 1, 9) },
];

/** Each works out its time when it's picked, so a screen left open a while doesn't snooze into the past. */
export const SNOOZES = [
  { label: "10 min", at: (now = new Date()) => later(now, 10) },
  { label: "1 hour", at: (now = new Date()) => later(now, 60) },
  { label: "Tomorrow", at: (now = new Date()) => at(now, 1, 9) },
];

/**
 * The first repeat after now (or after `from`, when ticked off early), on this phone's clock.
 * Only for showing it at once: the server works out the real one in the reminder's time zone.
 */
export function nextTime(from: Date, repeat: keyof typeof REPEATS, now = new Date()) {
  const after = Math.max(now.getTime(), from.getTime());
  for (let n = 1; ; n++) {
    const next = new Date(from);
    if (repeat === "month") {
      next.setMonth(from.getMonth() + n);
      if (next.getDate() !== from.getDate()) next.setDate(0); // the 31st in a short month: its last day, as Postgres does
    } else next.setDate(from.getDate() + n * (repeat === "week" ? 7 : 1));
    if (next.getTime() > after) return next;
  }
}

/** For <input type="datetime-local">: local time, to the minute. */
export const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * MINUTE).toISOString().slice(0, 16);
