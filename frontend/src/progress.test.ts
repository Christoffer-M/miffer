import assert from "node:assert/strict";
import { test } from "node:test";
import { caughtUp, next, share } from "./progress.ts";

const seasons = [10, 10, 8];

test("the next episode moves on to the next season after a season's last", () => {
  assert.deepEqual(next({ season: 1, episode: 3 }, seasons), { season: 1, episode: 4 });
  assert.deepEqual(next({ season: 1, episode: 10 }, seasons), { season: 2, episode: 1 });
  // After the very last one there's nowhere to go but on: that's caught up.
  assert.deepEqual(next({ season: 3, episode: 8 }, seasons), { season: 3, episode: 9 });
  // Not knowing the seasons, it just counts.
  assert.deepEqual(next({ season: 1, episode: 10 }), { season: 1, episode: 11 });
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
  assert.equal(share({ season: 2, episode: 5 }), undefined);
});
