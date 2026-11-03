// A watched series remembers where it ended: the end of its last season when it was watched.
// That's how many seasons were seen, and a season TMDB adds later shows up as new on the
// phones. Watched (and Finished) means all of it, so when a phone couldn't say where that is
// (its seasons hadn't loaded, or it was watched before this existed) the server fills it in.

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "./db/index.js";
import { notify } from "./live.js";
import { pushNewSeason } from "./push.js";
import { searchOn, seasons } from "./tmdb.js";

const { watch } = schema;

/**
 * Gives watched series from search without an end the end of their last season as it is now:
 * one series, or all of them. An end past what's out (from when TMDB's seasons counted
 * announced episodes) comes back to the end of what's out, so the next season shows up as new
 * when it airs. Only while the series is still watched with the same place, so someone moving
 * it meanwhile wins. TMDB not answering, or a series without seasons there, is left for the
 * next go. Each household with a change hears about it once.
 */
export async function fillEnds(only: { id?: string } = {}) {
  if (!searchOn) return;
  const watched = and(eq(watch.kind, "series"), isNotNull(watch.watchedAt));
  const rows = await db
    .select({
      id: watch.id,
      householdId: watch.householdId,
      title: watch.title,
      tmdbId: watch.tmdbId,
      season: watch.season,
      episode: watch.episode,
      toldSeason: watch.toldSeason,
    })
    .from(watch)
    .where(and(watched, isNotNull(watch.tmdbId), only.id ? eq(watch.id, only.id) : undefined));
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
    const end = { season: counts.length, episode: counts[counts.length - 1] + 1 };
    const past = row.season !== null && (row.season > end.season || (row.season === end.season && row.episode! > end.episode));
    if (row.season !== null && !past) {
      await announce(row, end.season);
      continue;
    }
    const same = row.season === null ? isNull(watch.season) : and(eq(watch.season, row.season), eq(watch.episode, row.episode!));
    const filled = await db
      .update(watch)
      .set({ ...end, progressAt: new Date(), toldSeason: end.season })
      .where(and(eq(watch.id, row.id), watched, same))
      .returning({ id: watch.id });
    if (filled.length) changed.add(row.householdId);
  }
  for (const householdId of changed) notify(householdId, "watch");
}

/**
 * Notifies the household once when a season comes out past where a watched series ended, so they
 * hear about it without opening the app. The first look only takes note of what's out, so a
 * series watched long ago doesn't announce seasons that came out before this existed. Noting it
 * and sending are one claim (the update), so two servers don't both send it.
 */
async function announce(row: { id: string; householdId: string; title: string; season: number | null; toldSeason: number | null }, out: number) {
  if (row.toldSeason !== null && out <= row.toldSeason) return;
  const told = await db
    .update(watch)
    .set({ toldSeason: out })
    .where(and(eq(watch.id, row.id), row.toldSeason === null ? isNull(watch.toldSeason) : eq(watch.toldSeason, row.toldSeason)))
    .returning({ id: watch.id });
  if (told.length && row.toldSeason !== null && out > row.season!) {
    await pushNewSeason(row.householdId, row.id, row.title, out).catch((err) => console.error("new season push failed", err));
  }
}
