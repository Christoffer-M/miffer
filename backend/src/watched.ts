// A watched series remembers where it ended: the end of its last season when it was watched.
// That's how many seasons were seen, and a season TMDB adds later shows up as new on the
// phones. Watched (and Finished) means all of it, so when a phone couldn't say where that is
// (its seasons hadn't loaded, or it was watched before this existed) the server fills it in.

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "./db/index.js";
import { notify } from "./live.js";
import { searchOn, seasons } from "./tmdb.js";

const { watch } = schema;

/**
 * Gives watched series from search without an end the end of their last season as it is now:
 * one series, or all of them. Only while the series is still watched with no
 * place, so someone putting it back meanwhile wins. TMDB not answering, or a series without
 * seasons there, is left for the next go. Each household with a change hears about it once.
 */
export async function fillEnds(only: { id?: string } = {}) {
  if (!searchOn) return;
  const missing = and(eq(watch.kind, "series"), isNotNull(watch.watchedAt), isNull(watch.season));
  const rows = await db
    .select({ id: watch.id, householdId: watch.householdId, tmdbId: watch.tmdbId })
    .from(watch)
    .where(
      and(
        missing,
        isNotNull(watch.tmdbId),
        only.id ? eq(watch.id, only.id) : undefined,
      ),
    );
  const changed = new Set<string>();
  for (const row of rows) {
    let counts: number[];
    try {
      counts = await seasons(row.tmdbId!);
    } catch (err) {
      console.error("seasons failed", err);
      continue;
    }
    if (!counts.length) continue;
    const filled = await db
      .update(watch)
      .set({ season: counts.length, episode: counts[counts.length - 1] + 1, progressAt: new Date() })
      .where(and(eq(watch.id, row.id), missing))
      .returning({ id: watch.id });
    if (filled.length) changed.add(row.householdId);
  }
  for (const householdId of changed) notify(householdId, "watch");
}
