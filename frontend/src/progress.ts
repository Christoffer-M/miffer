// Where a series is up to: the next episode to watch. `seasons` is how many episodes each
// season has ([10, 10, 8]), from TMDB; undefined when that isn't known (typed by hand, or
// offline), and then it just counts on.

export type Place = { season: number; episode: number };

/** The episode after `at`: the next season's first once this season's last is watched. */
export function next(at: Place, seasons?: number[]): Place {
  const inSeason = seasons?.[at.season - 1];
  if (inSeason !== undefined && at.episode >= inSeason && at.season < seasons!.length) {
    return { season: at.season + 1, episode: 1 };
  }
  return { season: at.season, episode: at.episode + 1 };
}

/** Past the last episode there is so far. */
export function caughtUp(at: Place, seasons?: number[]) {
  if (!seasons?.length) return false;
  const last = seasons.length;
  return at.season > last || (at.season === last && at.episode > seasons[last - 1]);
}

/** Episodes watched and how many there are, or undefined when the seasons aren't known. */
export function share(at: Place, seasons?: number[]) {
  if (!seasons?.length) return undefined;
  const total = seasons.reduce((n, e) => n + e, 0);
  const before = seasons.slice(0, at.season - 1).reduce((n, e) => n + e, 0);
  return { watched: Math.min(total, before + at.episode - 1), total };
}
