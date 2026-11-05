import { type QueryClient, queryOptions, useQueries } from "@tanstack/react-query";
import { api, ok, type Watch } from "../api";
import { remembered, whenForgotten } from "../remember";
import { caughtUp, type Place, type Seen, seen, share } from "../progress";
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

/** Plot, rating, cast, stills and genres from TMDB, for a movie or series' sheet. None for one typed by hand. */
export const detailsQuery = (w: { kind: Watch["kind"]; tmdbId: number | null }) =>
  queryOptions({
    queryKey: ["details", w.kind, w.tmdbId],
    queryFn: async () => (await ok(api.watch.details.$get({ query: { kind: w.kind, id: String(w.tmdbId) } }))).json(),
    enabled: w.tmdbId !== null,
    staleTime: Infinity,
    retry: false,
  });

const DAY = 24 * 60 * 60 * 1000;
// Under remember.ts' prefix, so forgetAll() clears it too. Renamed when the server changes
// what seasons mean: v2 counts only episodes that are out, so v1's announced ones are dropped.
const SEASONS_KEY = "miffer.last.seasons.v2";

type KeptSeasons = Record<string, { at: number; seasons: number[] }>;

// Read from the phone once and then kept in memory, as every series on screen looks itself up.
let kept: KeptSeasons | undefined;
let saving = false;
whenForgotten(() => (kept = undefined));

function keptSeasons(): KeptSeasons {
  if (kept) return kept;
  try {
    localStorage.removeItem("miffer.last.seasons"); // ponytail: v1, delete this line once every phone has opened since
    kept = JSON.parse(localStorage.getItem(SEASONS_KEY) ?? "{}") as KeptSeasons;
  } catch {
    kept = {};
  }
  return kept;
}

/** Keeps a series' seasons; written to the phone once for all that arrive together. */
function keep(tmdbId: number, seasons: number[]) {
  keptSeasons()[String(tmdbId)] = { at: Date.now(), seasons };
  if (saving) return;
  saving = true;
  setTimeout(() => {
    saving = false;
    if (!kept) return; // forgotten meanwhile
    const now = Date.now();
    kept = Object.fromEntries(Object.entries(kept).filter(([, k]) => now - k.at < 30 * DAY));
    try {
      localStorage.setItem(SEASONS_KEY, JSON.stringify(kept));
    } catch {} // full or blocked: it's fetched again next time
  });
}

// Series asked for together (all those on a screen) go to the server in one request.
const AT_ONCE = 100; // as many as routes/watch.ts takes
type Asked = { resolve: (seasons: number[]) => void; reject: (err: Error) => void };
let asked = new Map<number, Asked[]>();

function askSeasons(tmdbId: number) {
  return new Promise<number[]>((resolve, reject) => {
    if (!asked.size) setTimeout(sendAsked);
    asked.set(tmdbId, [...(asked.get(tmdbId) ?? []), { resolve, reject }]);
  });
}

async function sendAsked() {
  const batch = [...asked];
  asked = new Map();
  for (let i = 0; i < batch.length; i += AT_ONCE) {
    const part = batch.slice(i, i + AT_ONCE);
    try {
      const ids = part.map(([id]) => id).join(",");
      const found = await (await ok(api.watch.seasons.$get({ query: { ids } }))).json();
      for (const [id, waiting] of part) {
        const seasons = found[id];
        for (const w of waiting) {
          if (seasons) w.resolve(seasons);
          else w.reject(new Error("TMDB isn't answering right now."));
        }
      }
    } catch (err) {
      for (const [, waiting] of part) for (const w of waiting) w.reject(err as Error);
    }
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
      const seasons = await askSeasons(tmdbId!);
      keep(tmdbId!, seasons);
      return seasons;
    },
    initialData: () => keptSeasons()[String(tmdbId)]?.seasons,
    initialDataUpdatedAt: () => keptSeasons()[String(tmdbId)]?.at,
    enabled: tmdbId !== null,
    staleTime: DAY,
    retry: false,
  });

/** A season's episode names and stills, when Watching's sheet opens it. Not kept on the phone: offline it shows numbers. */
export const episodesQuery = (tmdbId: number | null, season: number) =>
  queryOptions({
    queryKey: ["episodes", tmdbId, season],
    queryFn: async () =>
      (await ok(api.watch.episodes.$get({ query: { id: String(tmdbId), season: String(season) } }))).json(),
    enabled: tmdbId !== null,
    staleTime: DAY,
    retry: false,
  });

/**
 * What Watched says about each watched series that remembers where it ended, from its seasons
 * (fetched for search ones; typed by hand there are none):
 * - `fresh`: episodes past that end, as TMDB has added a season or more episodes to the last
 *   one, with where to go on from.
 * - `seen`: how much was seen, "3 seasons". Series from search wait for their seasons.
 * Series watched without an end yet (the server fills it in) say neither.
 */
export function useWatchedSeries(list: Watch[]) {
  const ended = list.filter((w) => w.kind === "series" && w.watchedAt && w.season != null && w.episode != null);
  return useQueries({
    queries: ended.map((w) => ({
      ...seasonsQuery(w.tmdbId),
      // The server has told of a season these kept ones don't have (a push, watched.ts): ask now, not in a day.
      // ponytail: stays stale if TMDB takes a season back, so it asks on each open; the server keeps TMDB's answer.
      staleTime: (q: { state: { data?: number[] } }) =>
        w.toldSeason !== null && (q.state.data?.length ?? 0) < w.toldSeason ? 0 : DAY,
    })),
    combine: (results) => {
      const fresh = new Map<string, { label: string; place: Place }>();
      const seenBy = new Map<string, Seen>();
      ended.forEach((w, i) => {
        const seasons = results[i]?.data;
        if (w.tmdbId !== null && !seasons) return;
        const part = seen({ season: w.season!, episode: w.episode! }, seasons);
        if (part) seenBy.set(w.id, part);
        // No seasons on TMDB yet (or only specials) is as good as not knowing them.
        if (!seasons?.length || caughtUp(placeOf(w, seasons), seasons)) return;
        const place = placeOf(w, seasons);
        const shared = share(place, seasons);
        if (!shared) return;
        const left = shared.total - shared.watched;
        const label = place.episode === 1 ? "New season" : left === 1 ? "1 new episode" : `${left} new episodes`;
        fresh.set(w.id, { label, place });
      });
      return { fresh, seen: seenBy };
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
