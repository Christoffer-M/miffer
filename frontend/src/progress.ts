// Where a series is up to: the next episode to watch. `seasons` is how many episodes each
// season has ([10, 10, 8]), from TMDB; undefined when that isn't known (typed by hand, or not
// loaded yet), and then it just counts on.

export type Place = { season: number; episode: number };

/** As far as the server takes (app.ts); the steppers stop there. */
export const MAX_SEASON = 500;
export const MAX_EPISODE = 5000;

/**
 * A stored place as a real episode. Counted on without the seasons (S1 E11 of a 10-episode
 * season) it moves into the next season; caught up when TMDB adds a season, it moves to the new
 * one's first. Past the last episode there is, it stays one past it: caught up.
 */
export function settle(at: Place, seasons?: number[]): Place {
  if (!seasons?.length) return at;
  const last = seasons.length;
  if (at.season > last) return { season: last, episode: seasons[last - 1] + 1 };
  let { season, episode } = at;
  while (season < last && episode > seasons[season - 1]) {
    episode -= seasons[season - 1];
    season++;
  }
  return { season, episode: season === last ? Math.min(episode, seasons[last - 1] + 1) : episode };
}

/** Past the last episode there is so far: where a watched series ended, to spot a new season later. */
export function endOf(seasons?: number[]): Place | undefined {
  if (!seasons?.length) return undefined;
  return { season: seasons.length, episode: seasons[seasons.length - 1] + 1 };
}

/**
 * Finished a series typed by hand, whose seasons aren't known: the season it's in counts as
 * seen to the end (S3 E5 next up is three seasons). At a season's first episode that season
 * hadn't started, so it's the ones before (S3 E1 is two), and at S1 E1 nothing is known: null.
 * The server's migration 0009 does the same for series finished before this.
 */
export function finishedAt(at: Place): Place | null {
  if (at.episode > 1) return { season: at.season + 1, episode: 1 };
  return at.season > 1 ? at : null;
}

/** The episode after `at`: the next season's first once this season's last is watched. */
export function next(at: Place, seasons?: number[]): Place {
  const here = settle(at, seasons);
  return settle({ season: here.season, episode: here.episode + 1 }, seasons);
}

/** Past the last episode there is so far. */
export function caughtUp(at: Place, seasons?: number[]) {
  if (!seasons?.length) return false;
  const here = settle(at, seasons);
  return here.season === seasons.length && here.episode > seasons[seasons.length - 1];
}

/** How many episodes of each season are watched: [10, 3, 0, 0] at S2 E4 of [10, 10, 10, 8]. */
export function seasonParts(at: Place, seasons: number[]) {
  const here = settle(at, seasons);
  return seasons.map((n, i) =>
    i + 1 < here.season ? n : i + 1 === here.season ? Math.min(n, here.episode - 1) : 0,
  );
}

/** Episodes watched and how many there are, or undefined when the seasons aren't known. */
export function share(at: Place, seasons?: number[]) {
  if (!seasons?.length) return undefined;
  const total = seasons.reduce((n, e) => n + e, 0);
  return { watched: seasonParts(at, seasons).reduce((n, e) => n + e, 0), total };
}

/**
 * Tapping an episode in the grid: it's the last one seen, so the place moves on past it.
 * Tapping the last one seen again unmarks it, which is also how a series goes back to nothing
 * watched.
 */
export function tapEpisode(at: Place, tapped: Place, seasons: number[]): Place {
  const after = next(tapped, seasons);
  const here = settle(at, seasons);
  return after.season === here.season && after.episode === here.episode ? tapped : after;
}

/** How much of a series was seen: whole seasons, and episodes into the one after. */
export type Seen = { seasons: number; episodes: number };

/**
 * What a watched series' place says was seen. Finished, it remembers the end of its last season
 * (endOf), so that's all of them, even once TMDB adds another; finished without the seasons
 * known, it remembers the next episode up, so it's up to the one before. Without the seasons
 * (typed by hand) S3 E1 is two seasons and S3 E5 two seasons and four episodes.
 */
export function seen(at: Place, seasons?: number[]): Seen | undefined {
  const here = settle(at, seasons);
  const lastSeen = here.episode - 1;
  const whole = seasons?.length && here.season <= seasons.length && lastSeen >= seasons[here.season - 1];
  const result = whole ? { seasons: here.season, episodes: 0 } : { seasons: here.season - 1, episodes: lastSeen };
  return result.seasons || result.episodes ? result : undefined;
}

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** "3 seasons", "2 seasons and 4 episodes", "4 episodes". */
export function seenText({ seasons, episodes }: Seen) {
  return [seasons && count(seasons, "season"), episodes && count(episodes, "episode")].filter(Boolean).join(" and ");
}

/** As short as fits under a poster: "3 seasons", or "Up to S3 · E4" partway into one. */
export function seenShort({ seasons, episodes }: Seen) {
  return episodes ? `Up to S${seasons + 1} · E${episodes}` : count(seasons, "season");
}
