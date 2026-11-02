import { type QueryClient, queryOptions, useQueries } from "@tanstack/react-query";
import { api, ok, type Watch } from "../api";
import { remembered } from "../remember";
import { caughtUp, type Place, share } from "../progress";
import { isWatching, placeOf, type SeasonsOf, showsList, watchingLayout } from "../watch";
import { animateListChange } from "../viewTransition";

const watch = remembered("watch", async () => (await ok(api.watch.$get())).json());

export const watchQuery = queryOptions({
  queryKey: ["watch"],
  ...watch,
});

/** Movies and series on TMDB for what was typed. Not kept: it's only for adding, which needs a connection. */
export const searchQuery = (q: string) =>
  queryOptions({
    queryKey: ["search", q],
    queryFn: async () => (await ok(api.watch.search.$get({ query: { q } }))).json(),
    enabled: q.length >= 2,
    staleTime: Infinity,
    retry: false,
  });

const DAY = 24 * 60 * 60 * 1000;
const SEASONS_KEY = "miffer.last.seasons"; // under remember.ts' prefix, so forgetAll() clears it too

type KeptSeasons = Record<string, { at: number; seasons: number[] }>;

function keptSeasons(): KeptSeasons {
  try {
    return JSON.parse(localStorage.getItem(SEASONS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/**
 * Episodes per season of a series from search ([10, 10, 8]), so Watching knows when a season
 * ends. Kept on the phone with when it was fetched, so opening the app doesn't ask TMDB again
 * within a day (a season or two may be added while a series runs). All in one entry, dropping
 * series not looked at for a month, so removed ones don't pile up.
 */
export const seasonsQuery = (tmdbId: number | null) =>
  queryOptions({
    queryKey: ["seasons", tmdbId],
    queryFn: async () => {
      const seasons = await (await ok(api.watch.seasons[":tmdbId"].$get({ param: { tmdbId: String(tmdbId) } }))).json();
      const now = Date.now();
      const kept = Object.fromEntries(Object.entries(keptSeasons()).filter(([, k]) => now - k.at < 30 * DAY));
      kept[String(tmdbId)] = { at: now, seasons };
      try {
        localStorage.setItem(SEASONS_KEY, JSON.stringify(kept));
      } catch {} // full or blocked: it's fetched again next time
      return seasons;
    },
    initialData: () => keptSeasons()[String(tmdbId)]?.seasons,
    initialDataUpdatedAt: () => keptSeasons()[String(tmdbId)]?.at,
    enabled: tmdbId !== null,
    staleTime: DAY,
    retry: false,
  });

/**
 * Watched series with episodes past where they ended: TMDB has added a season, or more episodes
 * to the last one. Only series from search that remember their end (watched since this
 * existed) can tell; the rest just stay watched.
 */
export function useNewEpisodes(list: Watch[]) {
  const ended = list.filter(
    (w) => w.kind === "series" && w.watchedAt && w.tmdbId !== null && w.season != null && w.episode != null,
  );
  return useQueries({
    queries: ended.map((w) => seasonsQuery(w.tmdbId)),
    combine: (results) => {
      const found = new Map<string, { label: string; place: Place }>();
      ended.forEach((w, i) => {
        const seasons = results[i]?.data;
        if (!seasons || caughtUp(placeOf(w, seasons), seasons)) return;
        const place = placeOf(w, seasons);
        const part = share(place, seasons)!;
        const left = part.total - part.watched;
        const label = place.episode === 1 ? "New season" : left === 1 ? "1 new episode" : `${left} new episodes`;
        found.set(w.id, { label, place });
      });
      return found;
    },
  });
}

/** The seasons this phone has for each series, without fetching any. */
export const seasonsFrom =
  (qc: QueryClient): SeasonsOf =>
  (w) =>
    w.tmdbId === null ? undefined : qc.getQueryData(seasonsQuery(w.tmdbId).queryKey);

/** What the Watch screens show: order, titles, what's watched, and where each series is up to. */
const looks = (list: Watch[], seasonsOf: SeasonsOf) =>
  JSON.stringify([
    list.map((w) => [w.id, w.title, w.watchedAt, isWatching(w), w.season, w.episode]),
    watchingLayout(list, seasonsOf),
  ]);

/** Fetches the list after a live "watch" ping, animating someone else's change as for groceries (items.ts). */
export async function refreshWatch(qc: QueryClient) {
  const fresh = await watch.queryFn();
  const write = () => qc.setQueryData(watchQuery.queryKey, fresh);
  const current = qc.getQueryData(watchQuery.queryKey) ?? [];
  const seasonsOf = seasonsFrom(qc);
  const removed = current.some((w) => !fresh.some((f) => f.id === w.id));
  const moved = fresh.some((f) =>
    current.some((w) => w.id === f.id && (!w.watchedAt !== !f.watchedAt || isWatching(w) !== isWatching(f))),
  );
  // Anything else, like a series moving up on Watching or another episode ticked, just glides.
  const change = removed ? "remove" : moved ? "check" : undefined;
  if (looks(current, seasonsOf) !== looks(fresh, seasonsOf) && showsList()) animateListChange(write, change);
  else write();
}
