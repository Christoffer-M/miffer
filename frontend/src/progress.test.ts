import assert from "node:assert/strict";
import { test } from "node:test";
import { caughtUp, endOf, finishedAt, next, seasonParts, seen, seenShort, seenText, settle, share, tapEpisode } from "./progress.ts";

const seasons = [10, 10, 8];

test("the next episode moves on to the next season after a season's last", () => {
  assert.deepEqual(next({ season: 1, episode: 3 }, seasons), { season: 1, episode: 4 });
  assert.deepEqual(next({ season: 1, episode: 10 }, seasons), { season: 2, episode: 1 });
  // After the very last one there's nowhere to go but on: that's caught up, and it stays there.
  assert.deepEqual(next({ season: 3, episode: 8 }, seasons), { season: 3, episode: 9 });
  assert.deepEqual(next({ season: 3, episode: 9 }, seasons), { season: 3, episode: 9 });
  // Not knowing the seasons, it just counts.
  assert.deepEqual(next({ season: 1, episode: 10 }), { season: 1, episode: 11 });
});

test("a place counted on without the seasons lands on a real episode once they're known", () => {
  assert.deepEqual(settle({ season: 1, episode: 11 }, seasons), { season: 2, episode: 1 });
  assert.deepEqual(settle({ season: 1, episode: 13 }, seasons), { season: 2, episode: 3 });
  assert.deepEqual(settle({ season: 3, episode: 20 }, seasons), { season: 3, episode: 9 });
  assert.deepEqual(settle({ season: 9, episode: 1 }, seasons), { season: 3, episode: 9 });
  assert.deepEqual(settle({ season: 1, episode: 11 }), { season: 1, episode: 11 });
  // Ticked from S1 E10 while the seasons were still loading: the next tick isn't lost.
  assert.deepEqual(next({ season: 1, episode: 11 }, seasons), { season: 2, episode: 2 });
});

test("caught up moves to the new season when TMDB adds one", () => {
  const caught = { season: 3, episode: 9 };
  assert.equal(caughtUp(caught, seasons), true);
  assert.equal(caughtUp(caught, [...seasons, 10]), false);
  assert.deepEqual(settle(caught, [...seasons, 10]), { season: 4, episode: 1 });
  assert.deepEqual(next(caught, [...seasons, 10]), { season: 4, episode: 2 });
});

test("caught up is past the last episode there is", () => {
  assert.equal(caughtUp({ season: 3, episode: 8 }, seasons), false);
  assert.equal(caughtUp({ season: 3, episode: 9 }, seasons), true);
  assert.equal(caughtUp({ season: 4, episode: 1 }, seasons), true);
  assert.equal(caughtUp({ season: 9, episode: 9 }), false);
});

test("how much of a series is watched", () => {
  assert.deepEqual(share({ season: 1, episode: 1 }, seasons), { watched: 0, total: 28 });
  assert.deepEqual(share({ season: 2, episode: 5 }, seasons), { watched: 14, total: 28 });
  assert.deepEqual(share({ season: 3, episode: 9 }, seasons), { watched: 28, total: 28 });
  assert.deepEqual(share({ season: 1, episode: 11 }, seasons), { watched: 10, total: 28 });
  assert.equal(share({ season: 2, episode: 5 }), undefined);
});

test("how much of each season is watched", () => {
  assert.deepEqual(seasonParts({ season: 2, episode: 4 }, seasons), [10, 3, 0]);
  assert.deepEqual(seasonParts({ season: 3, episode: 9 }, seasons), [10, 10, 8]);
});

test("tapping an episode marks it as the last seen, and tapping it again unmarks it", () => {
  const at = { season: 2, episode: 4 };
  assert.deepEqual(tapEpisode(at, { season: 1, episode: 10 }, seasons), { season: 2, episode: 1 });
  assert.deepEqual(tapEpisode(at, { season: 2, episode: 6 }, seasons), { season: 2, episode: 7 });
  assert.deepEqual(tapEpisode(at, { season: 2, episode: 3 }, seasons), { season: 2, episode: 3 });
  // Back to nothing watched.
  assert.deepEqual(tapEpisode({ season: 1, episode: 2 }, { season: 1, episode: 1 }, seasons), { season: 1, episode: 1 });
  // The last of a season, with the next season's first up next.
  assert.deepEqual(tapEpisode({ season: 2, episode: 1 }, { season: 1, episode: 10 }, seasons), { season: 1, episode: 10 });
});

test("a watched series remembers its end, and a new season shows past it", () => {
  const end = endOf(seasons)!;
  assert.deepEqual(end, { season: 3, episode: 9 });
  assert.equal(caughtUp(end, seasons), true);
  assert.equal(caughtUp(end, [...seasons, 6]), false);
  assert.deepEqual(settle(end, [...seasons, 6]), { season: 4, episode: 1 });
  // More episodes in the same season: they're next instead.
  assert.deepEqual(settle(end, [10, 10, 12]), { season: 3, episode: 9 });
  assert.equal(caughtUp(end, [10, 10, 12]), false);
  assert.equal(endOf([]), undefined);
  assert.equal(endOf(undefined), undefined);
});

test("a watched series says how many seasons were seen", () => {
  const end = endOf(seasons)!;
  assert.deepEqual(seen(end, seasons), { seasons: 3, episodes: 0 });
  // A new season on TMDB, or more episodes in the last one: still the three seen then.
  assert.deepEqual(seen(end, [...seasons, 10]), { seasons: 3, episodes: 0 });
  assert.deepEqual(seen(end, [10, 10, 10]), { seasons: 2, episodes: 8 });
  // Finished partway, or typed by hand: up to the episode before the next one up.
  assert.deepEqual(seen({ season: 2, episode: 5 }, seasons), { seasons: 1, episodes: 4 });
  assert.deepEqual(seen({ season: 3, episode: 1 }), { seasons: 2, episodes: 0 });
  assert.deepEqual(seen({ season: 1, episode: 11 }, seasons), { seasons: 1, episodes: 0 });
  assert.equal(seen({ season: 1, episode: 1 }, seasons), undefined);

  assert.equal(seenText({ seasons: 3, episodes: 0 }), "3 seasons");
  assert.equal(seenText({ seasons: 1, episodes: 1 }), "1 season and 1 episode");
  assert.equal(seenText({ seasons: 0, episodes: 4 }), "4 episodes");
  assert.equal(seenShort({ seasons: 1, episodes: 0 }), "1 season");
  // Finished by hand: the season it's in counts as all seen.
  assert.deepEqual(seen(finishedAt({ season: 3, episode: 5 })), { seasons: 3, episodes: 0 });
  assert.deepEqual(seen(finishedAt({ season: 3, episode: 1 })), { seasons: 2, episodes: 0 });
  assert.deepEqual(seen(finishedAt({ season: 1, episode: 1 })), { seasons: 1, episodes: 0 });
  assert.equal(seenShort({ seasons: 2, episodes: 4 }), "Up to S3 · E4");
});
