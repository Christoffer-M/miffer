// Movie and series search, from The Movie Database (themoviedb.org). Without a key, search is off.
const KEY = process.env.TMDB_API_KEY;
export const searchOn = Boolean(KEY);

type Result = {
  id: number;
  media_type: string;
  original_language?: string;
  title?: string; // movies
  original_title?: string;
  release_date?: string;
  name?: string; // series
  original_name?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
  vote_average?: number;
  vote_count?: number;
};

/** Asks TMDB's API for `path`. */
async function get<T>(path: string, params: Record<string, string> = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.search = new URLSearchParams(params).toString();
  // TMDB hands out a short API key (sent as a parameter) and a long read access token (a header).
  const token = KEY!.length > 40;
  if (!token) url.searchParams.set("api_key", KEY!);
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${KEY}` } : {},
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`TMDB answered ${res.status}`);
  return (await res.json()) as T;
}

/** The best few movies and series for what was typed, most popular first (TMDB's order). */
export async function search(query: string) {
  const { results } = await get<{ results: Result[] }>("/search/multi", {
    query,
    include_adult: "false",
    language: "en-US",
  });
  return results
    .filter((r) => r.media_type === "movie" || r.media_type === "tv") // not people
    .slice(0, 6)
    .map((r) => {
      const original = r.original_title ?? r.original_name;
      const date = r.release_date || r.first_air_date;
      return {
        tmdbId: r.id,
        kind: r.media_type === "movie" ? ("movie" as const) : ("series" as const),
        // Danish and English titles as they are ("Druk", not "Another Round"); anything else in English.
        title: original && ["da", "en"].includes(r.original_language ?? "") ? original : (r.title ?? r.name ?? ""),
        year: date ? Number(date.slice(0, 4)) : null,
        posterPath: r.poster_path ?? null,
        // So the sheet that opens on a result has these at once, before its details arrive.
        overview: r.overview || null,
        rating: rating(r),
      };
    });
}

type Details = {
  runtime?: number | null; // movies, in minutes
  seasons?: { season_number: number; air_date: string | null }[]; // series
  genres?: { name: string }[];
  original_language?: string;
  overview?: string;
  vote_average?: number;
  vote_count?: number;
  credits?: { cast?: { name: string; character?: string; profile_path?: string | null }[] };
  images?: { backdrops?: { file_path: string; iso_639_1: string | null }[] };
};

/** Out of 10, to one decimal; a handful of votes says little, so those aren't shown. */
const rating = (r: { vote_average?: number; vote_count?: number }) =>
  r.vote_count && r.vote_count >= 10 ? Math.round(r.vote_average! * 10) / 10 : null;

/** What a movie or series' sheet shows of it: plot, rating, cast, stills, genres. One request to TMDB. */
export async function details(kind: "movie" | "series", tmdbId: number) {
  const d = await get<Details>(`/${kind === "movie" ? "movie" : "tv"}/${tmdbId}`, {
    append_to_response: "credits,images",
    include_image_language: "null,en", // English titles written on them only when there's nothing else
    language: "en-US",
  });
  return {
    overview: d.overview || null,
    rating: rating(d),
    runtime: d.runtime || null,
    seasons: out(d.seasons).length || null, // as Watching counts them
    genres: (d.genres ?? []).map((g) => g.name),
    language: d.original_language || null, // a code, "da": the phone names it
    cast: (d.credits?.cast ?? []).slice(0, 10).map((p) => ({
      name: p.name,
      character: p.character || null,
      profilePath: p.profile_path ?? null,
    })),
    stills: (d.images?.backdrops ?? [])
      .sort((a, b) => Number(a.iso_639_1 !== null) - Number(b.iso_639_1 !== null)) // stable: TMDB's order otherwise
      .slice(0, 8)
      .map((b) => b.file_path),
  };
}

/** Answers kept for a while, so phones asking for the same thing don't each ask TMDB; past `max`, the oldest go first. */
function keeper<K, V>(forMs: number, max: number) {
  const kept = new Map<K, { at: number; value: V }>();
  return async (key: K, fetch: () => Promise<V>) => {
    const k = kept.get(key);
    if (k && Date.now() - k.at < forMs) return k.value;
    const value = await fetch();
    kept.delete(key); // re-added last: a Map keeps insertion order
    kept.set(key, { at: Date.now(), value });
    if (kept.size > max) kept.delete(kept.keys().next().value!);
    return value;
  };
}

const KEEP_FOR_MS = 6 * 60 * 60 * 1000;
// Seasons asked for lately, so every phone opening Watching doesn't ask TMDB again. By series.
const seasonsKept = keeper<number, { counts: number[]; numbers: number[] }>(KEEP_FOR_MS, 1000);
// A season's episodes, by series and TMDB's season number.
const episodesKept = keeper<string, (EpisodeShown | null)[]>(KEEP_FOR_MS, 2000);

type Show = {
  seasons?: { season_number: number; episode_count: number; air_date: string | null }[];
  last_episode_to_air?: { season_number: number; episode_number: number } | null;
};

/** A series' seasons that are out: not specials (TMDB's season 0), not one announced for later. */
function out<S extends { season_number: number; air_date: string | null }>(seasons: S[] = []) {
  const today = new Date().toISOString().slice(0, 10); // TMDB's dates are YYYY-MM-DD
  return seasons.filter((s) => s.season_number > 0 && s.air_date && s.air_date <= today);
}

/** The seasons that are out, in order: how many episodes each has, and its number on TMDB. */
function aired(tmdbId: number) {
  return seasonsKept(tmdbId, async () => {
    const show = await get<Show>(`/tv/${tmdbId}`);
    const last = show.last_episode_to_air;
    const shown = out(show.seasons).sort((a, b) => a.season_number - b.season_number);
    return {
      counts: shown.map((s) => (s.season_number === last?.season_number ? last.episode_number : s.episode_count)),
      numbers: shown.map((s) => s.season_number),
    };
  });
}

/**
 * How many episodes each season of a series has, in order: [10, 10, 8] for three seasons.
 * Specials (TMDB's season 0) are left out, and so is what isn't out yet: a season announced
 * for next year, or the rest of one airing now. So a watched series shows a new season when
 * it comes out, not when it's announced.
 */
export async function seasons(tmdbId: number) {
  return (await aired(tmdbId)).counts;
}

type Episode = { episode_number: number; name: string; still_path?: string | null };
type EpisodeShown = { name: string; still: string | null };

/**
 * A season's episodes, the season counted as seasons() counts them (the second one out may be
 * TMDB's season 3, when one has no date). By episode number: index 0 is episode 1, null where
 * TMDB has none. Each one's name and still, a TMDB image name. A season that isn't out has none.
 */
export async function episodes(tmdbId: number, season: number) {
  const number = (await aired(tmdbId)).numbers[season - 1];
  if (number === undefined) return [];
  return episodesKept(`${tmdbId}/${number}`, async () => {
    const found = await get<{ episodes?: Episode[] }>(`/tv/${tmdbId}/season/${number}`, { language: "en-US" });
    const byNumber = new Map((found.episodes ?? []).map((e) => [e.episode_number, e]));
    const count = Math.max(0, ...byNumber.keys());
    return Array.from({ length: count }, (_, i) => {
      const e = byNumber.get(i + 1);
      return e ? { name: e.name, still: e.still_path ?? null } : null;
    });
  });
}
