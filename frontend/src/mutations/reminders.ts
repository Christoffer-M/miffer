import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { api, ok } from "../api";
import { remindersQuery } from "../queries/reminders";

export type NewReminder = InferRequestType<typeof api.reminders.$post>["json"];
export type ReminderChanges = InferRequestType<(typeof api.reminders)[":id"]["$patch"]>["json"];

// ponytail: no optimistic updates; the list refetches after each change (and on the live ping).
// Add them like mutations/items.ts if ticking off feels slow.
function useReminderMutation<V>(send: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: send, onSettled: () => qc.invalidateQueries(remindersQuery) });
}

export const useAddReminder = () => useReminderMutation((json: NewReminder) => ok(api.reminders.$post({ json })));

/** Edit, snooze (snoozedUntil) or put back from Done (done: false). */
export const useChangeReminder = () =>
  useReminderMutation(({ id, ...json }: ReminderChanges & { id: string }) =>
    ok(api.reminders[":id"].$patch({ param: { id }, json })),
  );

/** Ticks it off; a repeating one moves on to its next time instead. */
export const useCompleteReminder = () =>
  useReminderMutation((id: string) => ok(api.reminders[":id"].done.$post({ param: { id } })));

export const useDeleteReminder = () =>
  useReminderMutation((id: string) => ok(api.reminders[":id"].$delete({ param: { id } })));

export const useClearDoneReminders = () => useReminderMutation((_: void) => ok(api.reminders.done.$delete()));
