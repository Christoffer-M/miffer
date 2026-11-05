import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ok, type SearchResult, type Watch } from "../api";
import { seasonsFrom, watchQuery } from "../queries/watch";
import type { Place } from "../progress";
import { isWatching, type SeasonsOf, showsList, watchingLayout } from "../watch";
import { animateListChange, type ListChange } from "../viewTransition";
import { refetchWhenLast } from "./settle";

/** A movie or series to add: a search result, or typed by hand (no tmdbId, year or poster). */
export type NewWatch = Omit<SearchResult, "tmdbId" | "year" | "overview" | "rating"> & { tmdbId: number | null; year: number | null };

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
              toldSeason: null,
              watchedAt: null,
              createdAt: new Date().toISOString(),
            },
            ...list,
          ],
  );

/**
 * A series' place as the server stores it (placeFields in routes/watch.ts): set now, or at `at` for Undo,
 * so the series goes back where it was on Watching rather than to the top.
 */
function placed(place: Place | null, at?: string | null) {
  const now = new Date().toISOString();
  return {
    season: place?.season ?? null,
    episode: place?.episode ?? null,
    progressAt: place ? (at && at < now ? at : now) : null,
  };
}

type SetWatched = { id: string; watched: boolean; place?: Place | null; at?: string | null };

/** As the server does it: a watched series from search without a place waits for its end. */
function watchedIn(list: Watch[], { id, watched, place, at }: SetWatched) {
  return list.map((w) => {
    if (w.id !== id) return w;
    const watchedAt = watched ? new Date().toISOString() : null;
    if (w.kind !== "series") return { ...w, watchedAt };
    if (place !== undefined) return { ...w, watchedAt, ...placed(place, at) };
    return watched && w.tmdbId !== null ? { ...w, watchedAt, ...placed(null) } : { ...w, watchedAt };
  });
}

/**
 * Watched now, or back on the list. A series can set where it's up to in the same go (routes/watch.ts):
 * null starts it over on its shelf, the end of its last season remembers how far it went, and a
 * place to go on from takes it back to Watching. Watched without a place, a series from search
 * gets its end from the server; otherwise the place stays as it is. `at` is for Undo.
 */
export const useSetWatched = () =>
  useWatchMutation(
    "it couldn't be changed",
    ({ id, watched, place, at }: SetWatched) =>
      ok(api.watch[":id"].$patch({ param: { id }, json: { watched, place, at: at ?? undefined } })),
    watchedIn,
    "check",
  );

type SetProgress = { id: string; progress: Place | null; at?: string | null };

/** Where a series is up to now: started, on to another episode, or stopped (null). Not once it's watched (routes/watch.ts). */
function placeIn(list: Watch[], { id, progress, at }: SetProgress) {
  return list.map((w) => (w.id === id && !w.watchedAt ? { ...w, ...placed(progress, at) } : w));
}

/**
 * A series started, on to another episode, or stopped (null): back on its shelf.
 * Starting and stopping move it between screens. On Watching it animates when it moves there:
 * to the top, or into Caught up and out again. Another episode of the series on top doesn't.
 */
export const useSetProgress = () =>
  useWatchMutation(
    "it couldn't be changed",
    ({ id, progress, at }: SetProgress) =>
      ok(api.watch[":id"].progress.$put({ param: { id }, json: { progress, at: at ?? undefined } })),
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
