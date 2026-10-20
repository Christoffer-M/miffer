import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ok, type Item } from "../api";
import { itemsQuery } from "../queries/items";
import { animateListChange, type ListChange } from "../viewTransition";

/**
 * A change that shows (animated) on this phone at once, then gets confirmed by the server.
 * `change` picks the animation: "check" slides right, "remove" slides left.
 */
function useListMutation<V>(
  send: (v: V) => Promise<unknown>,
  apply: (items: Item[], v: V) => Item[],
  change?: ListChange,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: send,
    onMutate: async (v) => {
      await qc.cancelQueries(itemsQuery);
      animateListChange(() => qc.setQueryData(itemsQuery.queryKey, (old = []) => apply(old, v)), change);
    },
    // ponytail: no rollback; refetching puts the server's truth back either way.
    onSettled: () => qc.invalidateQueries(itemsQuery),
  });
}

export const useAddItem = () =>
  useListMutation(
    (item: { id: string; name: string; addedBy: string | null }) =>
      ok(api.items.$post({ json: { id: item.id, name: item.name } })),
    (items, item) => {
      const now = new Date().toISOString();
      return [{ ...item, householdId: "", done: false, createdAt: now, updatedAt: now }, ...items];
    },
  );

export const useSetDone = () =>
  useListMutation(
    ({ id, done }: { id: string; done: boolean }) =>
      ok(api.items[":id"].$patch({ param: { id }, json: { done } })),
    (items, { id, done }) => items.map((i) => (i.id === id ? { ...i, done } : i)),
    "check",
  );

export const useRemoveItem = () =>
  useListMutation(
    (id: string) => ok(api.items[":id"].$delete({ param: { id } })),
    (items, id) => items.filter((i) => i.id !== id),
    "remove",
  );

export const useClearDone = () =>
  useListMutation(
    (_: void) => ok(api.items.done.$delete()),
    (items) => items.filter((i) => !i.done),
    "remove",
  );
