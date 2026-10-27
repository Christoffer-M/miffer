import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { api, ok, type Reminder } from "../api";
import { refreshReminders, remindersQuery } from "../queries/reminders";
import { nextTime } from "../reminders";
import { animateListChange, type ListChange } from "../viewTransition";
import { refetchWhenLast } from "./settle";

export type NewReminder = InferRequestType<typeof api.reminders.$post>["json"];
export type ReminderChanges = InferRequestType<(typeof api.reminders)[":id"]["$patch"]>["json"];

/**
 * A change that shows on this phone at once (`apply`, animated on the Reminders screen), then gets
 * confirmed by the server. Without `apply` the list just refetches once the server has it.
 * `change` picks the animation, as for groceries: "check" slides right, "remove" slides left.
 */
function useReminderMutation<V, R>(
  send: (v: V) => Promise<R>,
  apply?: (list: Reminder[], v: V) => Reminder[],
  change?: (v: V) => ListChange | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: send,
    mutationKey: ["reminders"],
    // Sent one at a time, in order, so a quick tick and untick reach the server as they happened.
    scope: { id: "reminders" },
    onMutate: async (v) => {
      if (!apply) return;
      await qc.cancelQueries(remindersQuery);
      const write = () => qc.setQueryData(remindersQuery.queryKey, (old = []) => apply(old, v));
      if (location.pathname === "/reminders") animateListChange(write, change?.(v));
      else write();
    },
    // ponytail: no rollback; refetching puts the server's truth back either way.
    onSettled: () =>
      refetchWhenLast(qc, "reminders", () => refreshReminders(qc).catch(() => qc.invalidateQueries(remindersQuery))),
  });
}

const update = (list: Reminder[], id: string, change: (r: Reminder) => Partial<Reminder>) =>
  list.map((r) => (r.id === id ? { ...r, ...change(r) } : r));

export const useAddReminder = () => useReminderMutation((json: NewReminder) => ok(api.reminders.$post({ json })));

/** Edit, snooze (snoozedUntil) or put back from Done (done: false). */
export const useChangeReminder = () =>
  useReminderMutation(
    ({ id, ...json }: ReminderChanges & { id: string }) => ok(api.reminders[":id"].$patch({ param: { id }, json })),
    // Same rules as the server: a new time or a snooze makes it wait again.
    (list, { id, remindAt, snoozedUntil, ...rest }) =>
      update(list, id, () => ({
        ...rest,
        ...(remindAt !== undefined && { remindAt, snoozedUntil: null, notified: false }),
        ...(snoozedUntil && { snoozedUntil, notified: false }),
      })),
    // Snoozing and putting back slide it across to where it goes now, like ticking it off.
    ({ snoozedUntil, done }) => (snoozedUntil || done === false ? "check" : undefined),
  );

/** Ticks it off; a repeating one moves on to its next time instead. Resolves to its times on the server after. */
export const useCompleteReminder = () =>
  useReminderMutation(
    async (id: string) => (await ok(api.reminders[":id"].done.$post({ param: { id } }))).json(),
    (list, id) =>
      update(list, id, (r) =>
        r.repeat && r.remindAt
          ? { remindAt: nextTime(new Date(r.remindAt), r.repeat).toISOString(), snoozedUntil: null, notified: false }
          : { done: true, snoozedUntil: null },
      ),
    () => "check",
  );

type ReminderState = InferRequestType<(typeof api.reminders)[":id"]["state"]["$put"]>["json"];
export type ReminderTimes = ReminderState["ifStill"];

/**
 * Undo of Done or Snooze: puts back its times and whether it was sent or done, if it's still
 * as Done or Snooze left it (`ifStill`, known once that's through). Else the refetch shows what changed.
 */
export const useRestoreReminder = () =>
  useReminderMutation(
    async ({ id, ifStill, ...json }: Omit<ReminderState, "ifStill"> & { id: string; ifStill: Promise<ReminderTimes> }) =>
      ok(api.reminders[":id"].state.$put({ param: { id }, json: { ...json, ifStill: await ifStill } })),
    (list, { id, remindAt, snoozedUntil, notified, done }) => update(list, id, () => ({ remindAt, snoozedUntil, notified, done })),
  );

export const useDeleteReminder = () =>
  useReminderMutation(
    (id: string) => ok(api.reminders[":id"].$delete({ param: { id } })),
    (list, id) => list.filter((r) => r.id !== id),
    () => "remove",
  );

export const useClearDoneReminders = () =>
  useReminderMutation(
    (_: void) => ok(api.reminders.done.$delete()),
    (list) => list.filter((r) => !r.done),
    () => "remove",
  );
