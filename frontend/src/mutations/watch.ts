import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ok, type SearchResult, type Watch } from "../api";
import { watchQuery } from "../queries/watch";
import { showsList } from "../watch";
import { animateListChange, type ListChange } from "../viewTransition";
import { refetchWhenLast } from "./settle";

/** A movie or series to add: a search result, or typed by hand (no tmdbId, year or poster). */
export type NewWatch = Omit<SearchResult, "tmdbId" | "year"> & { tmdbId: number | null; year: number | null };

/** As for groceries (items.ts): shows at once, animated on the Watch screens, then the server confirms it. */
function useWatchMutation<V>(
  offline: string,
  send: (v: V) => Promise<unknown>,
  apply: (list: Watch[], v: V) => Watch[],
  change?: ListChange,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: send,
    mutationKey: ["watch"],
    meta: { offline },
    scope: { id: "watch" },
    onMutate: async (v) => {
      await qc.cancelQueries(watchQuery);
      const write = () => qc.setQueryData(watchQuery.queryKey, (old = []) => apply(old, v));
      if (showsList()) animateListChange(write, change);
      else write();
    },
    // ponytail: no rollback; refetching puts the server's truth back either way.
    onSettled: () => refetchWhenLast(qc, "watch", () => qc.invalidateQueries(watchQuery)),
  });
}

export const useAddWatch = () =>
  useWatchMutation(
    "it couldn't be added",
    ({ addedBy: _, ...w }: NewWatch & { id: string; addedBy: string | null }) => ok(api.watch.$post({ json: w })),
    // Skipped if the server's answer got here first: the animated update can run a little late.
    (list, w) =>
      list.some((x) => x.id === w.id)
        ? list
        : [{ ...w, householdId: "", watchedAt: null, createdAt: new Date().toISOString() }, ...list],
  );

/** Watched now, or back on the list. */
export const useSetWatched = () =>
  useWatchMutation(
    "it couldn't be changed",
    ({ id, watched }: { id: string; watched: boolean }) =>
      ok(api.watch[":id"].$patch({ param: { id }, json: { watched } })),
    (list, { id, watched }) =>
      list.map((w) => (w.id === id ? { ...w, watchedAt: watched ? new Date().toISOString() : null } : w)),
    "check",
  );

export const useRemoveWatch = () =>
  useWatchMutation(
    "it couldn't be removed",
    (id: string) => ok(api.watch[":id"].$delete({ param: { id } })),
    (list, id) => list.filter((w) => w.id !== id),
    "remove",
  );

/** Undo: puts a removed one back as it was, in its old place. */
export const useRestoreWatch = () =>
  useWatchMutation(
    "it couldn't be put back",
    ({ householdId: _, ...w }: Watch) => ok(api.watch.restore.$post({ json: w })),
    (list, w) => [...list.filter((x) => x.id !== w.id), w].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
