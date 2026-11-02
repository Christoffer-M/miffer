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
