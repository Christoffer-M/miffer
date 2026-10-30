import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { api, ok, type Reminder } from "../api";
import { remembered } from "../remember";
import { animateListChange } from "../viewTransition";

const reminders = remembered("reminders", async () => (await ok(api.reminders.$get())).json());
const fetchReminders = reminders.queryFn;

export const remindersQuery = queryOptions({
  queryKey: ["reminders"],
  ...reminders,
});

/** What the Reminders screen shows of each: where it sits and what it says. */
const looks = (list: Reminder[] = []) =>
  JSON.stringify(
    list.map((r) => [r.id, r.title, r.done, r.notified, r.remindAt, r.snoozedUntil, r.repeat, r.forDevice]),
  );

/**
 * Fetches the reminders, after a live "reminders" ping or this phone's own last change. On the
 * Reminders screen a change that shows (a new one, or someone else's) is animated, as for groceries.
 */
export async function refreshReminders(qc: QueryClient) {
  const fresh = await fetchReminders();
  const write = () => qc.setQueryData(remindersQuery.queryKey, fresh);
  const current = qc.getQueryData(remindersQuery.queryKey) ?? [];
  const removed = current.some((r) => !fresh.some((f) => f.id === r.id));
  if (looks(current) !== looks(fresh) && location.pathname === "/reminders") {
    animateListChange(write, removed ? "remove" : undefined);
  } else write();
}
