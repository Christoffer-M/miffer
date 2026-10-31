import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ok, type Item } from "../api";
import { itemsQuery } from "../queries/items";
import { animateListChange, type ListChange } from "../viewTransition";
import { refetchWhenLast } from "./settle";

/**
 * A change that shows (animated) on this phone at once, then gets confirmed by the server.
 * `offline` says what didn't happen when it's refused offline (offline.ts).
 * `change` picks the animation: "check" slides right, "remove" slides left.
 */
function useListMutation<V>(
  offline: string,
  send: (v: V) => Promise<unknown>,
  apply: (items: Item[], v: V) => Item[],
  change?: ListChange,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: send,
    mutationKey: ["items"],
    meta: { offline },
    // Sent one at a time, in order, so an Undo can't reach the server before the delete it undoes.
    scope: { id: "items" },
    onMutate: async (v) => {
      await qc.cancelQueries(itemsQuery);
      animateListChange(() => qc.setQueryData(itemsQuery.queryKey, (old = []) => apply(old, v)), change);
    },
    // ponytail: no rollback; refetching puts the server's truth back either way.
    onSettled: () => refetchWhenLast(qc, "items", () => qc.invalidateQueries(itemsQuery)),
  });
}

export const useAddItem = () =>
  useListMutation(
    "the item couldn't be added",
    (item: { id: string; name: string; addedBy: string | null }) =>
      ok(api.items.$post({ json: { id: item.id, name: item.name } })),
    (items, item) => {
      const now = new Date().toISOString();
      return [{ ...item, householdId: "", done: false, createdAt: now, updatedAt: now }, ...items];
    },
  );

export const useSetDone = () =>
  useListMutation(
    "the item couldn't be changed",
    ({ id, done }: { id: string; done: boolean }) =>
      ok(api.items[":id"].$patch({ param: { id }, json: { done } })),
    (items, { id, done }) => items.map((i) => (i.id === id ? { ...i, done } : i)),
    "check",
  );

export const useRemoveItem = () =>
  useListMutation(
    "the item couldn't be removed",
    (id: string) => ok(api.items[":id"].$delete({ param: { id } })),
    (items, id) => items.filter((i) => i.id !== id),
    "remove",
  );

export const useClearDone = () =>
  useListMutation(
    "the cart couldn't be cleared",
    (_: void) => ok(api.items.done.$delete()),
    (items) => items.filter((i) => !i.done),
    "remove",
  );

/** Undo: puts removed items back as they were, in their old place in the list. */
export const useRestoreItems = () =>
  useListMutation(
    "the items couldn't be put back",
    (removed: Item[]) =>
      ok(
        api.items.restore.$post({
          json: removed.map(({ id, name, done, addedBy, createdAt }) => ({ id, name, done, addedBy, createdAt })),
        }),
      ),
    (items, removed) =>
      [...items.filter((i) => !removed.some((r) => r.id === i.id)), ...removed].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
  );
