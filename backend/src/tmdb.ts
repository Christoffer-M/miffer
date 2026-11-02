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
};

/** The best few movies and series for what was typed, most popular first (TMDB's order). */
export async function search(query: string) {
  const url = new URL("https://api.themoviedb.org/3/search/multi");
  url.search = new URLSearchParams({ query, include_adult: "false", language: "en-US" }).toString();
  // TMDB hands out a short API key (sent as a parameter) and a long read access token (a header).
  const token = KEY!.length > 40;
  if (!token) url.searchParams.set("api_key", KEY!);
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${KEY}` } : {},
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`TMDB answered ${res.status}`);
  const { results } = (await res.json()) as { results: Result[] };
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
      };
    });
}
