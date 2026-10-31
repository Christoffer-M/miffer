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
 * `offline` says what didn't happen when it's refused offline (offline.ts).
 * `change` picks the animation, as for groceries: "check" slides right, "remove" slides left.
 */
function useReminderMutation<V, R>(
  offline: string,
  send: (v: V) => Promise<R>,
  apply?: (list: Reminder[], v: V) => Reminder[],
  change?: (v: V) => ListChange | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: send,
    mutationKey: ["reminders"],
    meta: { offline },
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

export const useAddReminder = () => useReminderMutation("the reminder couldn't be added", (json: NewReminder) => ok(api.reminders.$post({ json })));

/** Edit, snooze (snoozedUntil) or put back from Done (done: false). */
export const useChangeReminder = () =>
  useReminderMutation(
    "the reminder couldn't be changed",
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
    "the reminder couldn't be marked done",
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
    "the reminder couldn't be put back",
    async ({ id, ifStill, ...json }: Omit<ReminderState, "ifStill"> & { id: string; ifStill: Promise<ReminderTimes> }) =>
      ok(api.reminders[":id"].state.$put({ param: { id }, json: { ...json, ifStill: await ifStill } })),
    (list, { id, remindAt, snoozedUntil, notified, done }) => update(list, id, () => ({ remindAt, snoozedUntil, notified, done })),
  );

export const useDeleteReminder = () =>
  useReminderMutation(
    "the reminder couldn't be deleted",
    (id: string) => ok(api.reminders[":id"].$delete({ param: { id } })),
    (list, id) => list.filter((r) => r.id !== id),
    () => "remove",
  );

export const useClearDoneReminders = () =>
  useReminderMutation(
    "done reminders couldn't be cleared",
    (_: void) => ok(api.reminders.done.$delete()),
    (list) => list.filter((r) => !r.done),
    () => "remove",
  );
