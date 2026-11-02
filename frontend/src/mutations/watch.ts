import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ok, type SearchResult, type Watch } from "../api";
import { seasonsFrom, watchQuery } from "../queries/watch";
import type { Place } from "../progress";
import { isWatching, type SeasonsOf, showsList, watchingLayout } from "../watch";
import { animateListChange, type ListChange } from "../viewTransition";
import { refetchWhenLast } from "./settle";

/** A movie or series to add: a search result, or typed by hand (no tmdbId, year or poster). */
export type NewWatch = Omit<SearchResult, "tmdbId" | "year"> & { tmdbId: number | null; year: number | null };

/**
 * As for groceries (items.ts): shows at once, animated on the Watch screens, then the server
 * confirms it. `change` can depend on the list as it was: false then skips the animation.
 */
function useWatchMutation<V>(
  offline: string,
  send: (v: V) => Promise<unknown>,
  apply: (list: Watch[], v: V) => Watch[],
  change?: ListChange | ((list: Watch[], v: V, seasonsOf: SeasonsOf) => ListChange | false | undefined),
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
      const old = qc.getQueryData(watchQuery.queryKey) ?? [];
      const how = typeof change === "function" ? change(old, v, seasonsFrom(qc)) : change;
      if (how !== false && showsList()) animateListChange(write, how);
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
        : [
            {
              ...w,
              householdId: "",
              season: null,
              episode: null,
              progressAt: null,
              watchedAt: null,
              createdAt: new Date().toISOString(),
            },
            ...list,
          ],
  );

/**
 * Watched now, or back on the list. A series can set where it's up to in the same go (app.ts):
 * null starts it over on its shelf, the end of its last season remembers how far it went, and a
 * place to go on from takes it back to Watching. Left out, the place stays as it is.
 */
export const useSetWatched = () =>
  useWatchMutation(
    "it couldn't be changed",
    ({ id, watched, place }: { id: string; watched: boolean; place?: Place | null }) =>
      ok(api.watch[":id"].$patch({ param: { id }, json: { watched, place } })),
    (list, { id, watched, place }) =>
      list.map((w) =>
        w.id !== id
          ? w
          : {
              ...w,
              watchedAt: watched ? new Date().toISOString() : null,
              ...(place !== undefined &&
                w.kind === "series" && {
                  season: place?.season ?? null,
                  episode: place?.episode ?? null,
                  progressAt: place ? new Date().toISOString() : null,
                }),
            },
      ),
    "check",
  );

/** Where a series is up to now: started, on to another episode, or stopped (null). */
function placeIn(list: Watch[], { id, progress }: { id: string; progress: Place | null }) {
  return list.map((w) =>
    w.id === id
      ? {
          ...w,
          season: progress?.season ?? null,
          episode: progress?.episode ?? null,
          progressAt: progress ? new Date().toISOString() : null,
        }
      : w,
  );
}

/**
 * A series started, on to another episode, or stopped (null): back on its shelf.
 * Starting and stopping move it between screens. On Watching it animates when it moves there:
 * to the top, or into Caught up and out again. Another episode of the series on top doesn't.
 */
export const useSetProgress = () =>
  useWatchMutation(
    "it couldn't be changed",
    ({ id, progress: place }: { id: string; progress: Place | null }) =>
      ok(api.watch[":id"].progress.$put({ param: { id }, json: { progress: place } })),
    placeIn,
    (list, v, seasonsOf) => {
      if (isWatching(list.find((w) => w.id === v.id)) !== !!v.progress) return "check";
      return watchingLayout(list, seasonsOf) === watchingLayout(placeIn(list, v), seasonsOf) ? false : undefined;
    },
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
