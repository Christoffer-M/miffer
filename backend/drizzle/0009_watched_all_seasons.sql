-- Watched and Finished now mean all of a series. Before, Finished kept the place a series was
-- at when its seasons weren't known on the phone. Those are the watched series whose place is
-- older than when they were watched: setting a place with Watched stamps it right after.
-- From search, the place goes, and the server fills in the end of the last season (watched.ts).
UPDATE "watch" SET "season" = NULL, "episode" = NULL, "progress_at" = NULL
WHERE "kind" = 'series' AND "watched_at" IS NOT NULL AND "tmdb_id" IS NOT NULL
  AND "season" IS NOT NULL AND ("progress_at" IS NULL OR "progress_at" < "watched_at");--> statement-breakpoint
-- Typed by hand, the season it was in counts as done (finishedAt in the app's progress.ts):
-- S3 E5 next up is three seasons, S3 E1 two. S1 E1 says nothing was seen, so nothing is known.
UPDATE "watch"
SET "season" = CASE WHEN "season" = 1 AND "episode" = 1 THEN NULL
                    WHEN "episode" = 1 THEN "season" ELSE "season" + 1 END,
    "episode" = CASE WHEN "season" = 1 AND "episode" = 1 THEN NULL ELSE 1 END,
    "progress_at" = CASE WHEN "season" = 1 AND "episode" = 1 THEN NULL ELSE "watched_at" END
WHERE "kind" = 'series' AND "watched_at" IS NOT NULL AND "tmdb_id" IS NULL
  AND "season" IS NOT NULL AND ("progress_at" IS NULL OR "progress_at" < "watched_at");
