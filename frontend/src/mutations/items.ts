import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ok, type Item } from "../api";
import { itemsQuery } from "../queries/items";
import { animateListChange } from "../viewTransition";

/**
 * A change that shows (animated) on this phone at once, then gets confirmed by the server.
 * `pop` picks the item that should pop as it moves (the one being ticked);
 * `removing` marks changes that take items off the list.
 */
function useListMutation<V>(
  send: (v: V) => Promise<unknown>,
  apply: (items: Item[], v: V) => Item[],
  { pop, removing }: { pop?: (v: V) => string; removing?: boolean } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: send,
    onMutate: async (v) => {
      await qc.cancelQueries(itemsQuery);
      animateListChange(() => qc.setQueryData(itemsQuery.queryKey, (old = []) => apply(old, v)), {
        pop: pop?.(v),
        removing,
      });
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
    { pop: ({ id }) => id },
  );

export const useRemoveItem = () =>
  useListMutation(
    (id: string) => ok(api.items[":id"].$delete({ param: { id } })),
    (items, id) => items.filter((i) => i.id !== id),
    { removing: true },
  );

export const useClearDone = () =>
  useListMutation(
    (_: void) => ok(api.items.done.$delete()),
    (items) => items.filter((i) => !i.done),
    { removing: true },
  );
