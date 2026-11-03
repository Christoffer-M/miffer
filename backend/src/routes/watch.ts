import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { auth, type Env, isMember } from "../auth.js";
import { db, schema } from "../db/index.js";
import { notify } from "../live.js";
import { details, search, searchOn, seasons } from "../tmdb.js";
import { fillEnds } from "../watched.js";

const { watch } = schema;

const watchFields = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(["movie", "series"]),
  // From a search result; null when typed by hand.
  tmdbId: z.number().int().positive().nullable(),
  year: z.number().int().min(1870).max(2200).nullable(),
  // Only a TMDB image name: phones put it in an image address.
  posterPath: z.string().regex(/^\/\w+\.(jpg|png)$/).nullable(),
});
const watchParam = zValidator("param", z.object({ id: z.uuid() }));
// The next episode up in a series being watched.
const progress = z.object({ season: z.number().int().min(1).max(500), episode: z.number().int().min(1).max(5000) });
type Place = z.infer<typeof progress>;
// When a place was set: Undo sends the old one back, so the series goes back where it was on
// Watching (the one watched last is on top) instead of jumping up.
const progressAt = z.iso.datetime().optional();

/** A series' place as stored. Set now, or at `at` for Undo, though never later than now. */
function placeFields(place: Place | null, at?: string) {
  const now = new Date();
  const when = at && new Date(at) < now ? new Date(at) : now;
  return { season: place?.season ?? null, episode: place?.episode ?? null, progressAt: place ? when : null };
}

/** A series takes `value`; a movie's place stays empty. So one update does both kinds. */
const forSeries = (value: number | Date | null, type: "integer" | "timestamptz") =>
  sql`case when ${watch.kind} = 'series' then ${value instanceof Date ? value.toISOString() : value}::${sql.raw(type)} end`;
// Batches of seasons a phone can ask for at once (Watch asks for every series it shows).
const SEASONS_AT_ONCE = 100;

// What phones get of a watch row: all but toldSeason, which only the server uses (watched.ts).
const { toldSeason: _, ...watchShown } = getTableColumns(watch);

export const watchRoutes = new Hono<Env>()
  .use(auth)
  .get("/", async (c) => {
    const rows = await db
      .select(watchShown)
      .from(watch)
      .where(eq(watch.householdId, c.var.householdId))
      .orderBy(desc(watch.createdAt));
    return c.json(rows);
  })
  // Through here rather than from the phone, so the TMDB key stays on the server.
  .get("/search", zValidator("query", z.object({ q: z.string().trim().min(1).max(100) })), async (c) => {
    if (!searchOn) return c.json({ error: "Search isn't set up on the server yet." }, 503);
    try {
      return c.json(await search(c.req.valid("query").q));
    } catch (err) {
      console.error("search failed", err);
      return c.json({ error: "Search isn't answering right now." }, 502);
    }
  })
  // Plot, rating, cast, stills and genres, for the sheet a movie or series opens in (search results too).
  .get(
    "/details",
    zValidator("query", z.object({ kind: z.enum(["movie", "series"]), id: z.coerce.number().int().positive() })),
    async (c) => {
      if (!searchOn) return c.json({ error: "Search isn't set up on the server yet." }, 503);
      const { kind, id } = c.req.valid("query");
      try {
        return c.json(await details(kind, id));
      } catch (err) {
        console.error("details failed", err);
        return c.json({ error: "TMDB isn't answering right now." }, 502);
      }
    },
  )
  // Episodes per season of series from search, so the phone knows when a season ends: several
  // series in one go (?ids=1408,1399), each with its seasons, or null where TMDB didn't answer.
  .get(
    "/seasons",
    zValidator(
      "query",
      z.object({
        ids: z
          .string()
          .regex(/^[1-9]\d{0,9}(,[1-9]\d{0,9})*$/)
          .transform((ids) => [...new Set(ids.split(",").map(Number))])
          .refine((ids) => ids.length <= SEASONS_AT_ONCE, `At most ${SEASONS_AT_ONCE} at once`),
      }),
    ),
    async (c) => {
      if (!searchOn) return c.json({ error: "Search isn't set up on the server yet." }, 503);
      const ids = c.req.valid("query").ids;
      const found: Record<string, number[] | null> = {};
      // A few at a time, so a long list doesn't hit TMDB all at once.
      for (let i = 0; i < ids.length; i += 8) {
        await Promise.all(
          ids.slice(i, i + 8).map(async (id) => {
            try {
              found[id] = await seasons(id);
            } catch (err) {
              console.error("seasons failed", err);
              found[id] = null;
            }
          }),
        );
      }
      return c.json(found);
    },
  )
  .post("/", zValidator("json", watchFields.extend({ id: z.uuid() })), async (c) => {
    // No notification, unlike groceries: a new title can wait until someone opens Watch.
    await db
      .insert(watch)
      .values({ ...c.req.valid("json"), householdId: c.var.householdId, addedBy: c.var.deviceId })
      .onConflictDoNothing(); // a retried request, or already on the list
    notify(c.var.householdId, "watch");
    return c.body(null, 204);
  })
  // Undo of a delete: puts it back as it was, watched or not, in its old place.
  .post(
    "/restore",
    zValidator(
      "json",
      watchFields.extend({
        id: z.uuid(),
        addedBy: z.uuid().nullable(),
        watchedAt: z.iso.datetime().nullable(),
        createdAt: z.iso.datetime(),
        // Missing from a phone that queued this before progress existed.
        season: progress.shape.season.nullable().default(null),
        episode: progress.shape.episode.nullable().default(null),
        progressAt: z.iso.datetime().nullable().default(null),
      }),
    ),
    async (c) => {
      const { addedBy, watchedAt, createdAt, season, episode, progressAt, ...rest } = c.req.valid("json");
      const started = rest.kind === "series" && season !== null && episode !== null;
      await db
        .insert(watch)
        .values({
          ...rest,
          householdId: c.var.householdId,
          // Only someone in this household can have added it.
          addedBy: addedBy && (await isMember(c.var.householdId, addedBy)) ? addedBy : null,
          watchedAt: watchedAt ? new Date(watchedAt) : null,
          createdAt: new Date(createdAt),
          season: started ? season : null,
          episode: started ? episode : null,
          progressAt: started && progressAt ? new Date(progressAt) : null,
        })
        .onConflictDoNothing(); // already back (a retry), or someone else's id: left as it is
      notify(c.var.householdId, "watch");
      return c.body(null, 204);
    },
  )
  // Watched (now), or back on the list. A series can set where it's up to in the same go:
  // `place` null starts it over on its shelf (Put back), the end of its last season remembers how
  // far it went when watched (to spot a new season later), and a place to go on from takes it
  // back to Watching (Continue); `at` is for Undo (placeFields).
  // Watched without a place, a series from search gets its end from the server (watched.ts),
  // after answering: the phone needn't have its seasons. Typed by hand, and back on the list
  // without a place, the place stays as it is.
  .patch(
    "/:id",
    watchParam,
    zValidator("json", z.object({ watched: z.boolean(), place: progress.nullable().optional(), at: progressAt })),
    async (c) => {
      const { watched, place, at } = c.req.valid("json");
      const set = place !== undefined && placeFields(place, at);
      await db
        .update(watch)
        .set({
          watchedAt: watched ? new Date() : null,
          ...(set
            ? {
                season: forSeries(set.season, "integer"),
                episode: forSeries(set.episode, "integer"),
                progressAt: forSeries(set.progressAt, "timestamptz"),
              }
            : watched && {
                // Left for fillEnds, which fills in series without a place.
                season: sql`case when ${watch.tmdbId} is null then ${watch.season} end`,
                episode: sql`case when ${watch.tmdbId} is null then ${watch.episode} end`,
                progressAt: sql`case when ${watch.tmdbId} is null then ${watch.progressAt} end`,
              }),
        })
        .where(and(eq(watch.id, c.req.valid("param").id), eq(watch.householdId, c.var.householdId)));
      notify(c.var.householdId, "watch");
      if (watched) fillEnds({ id: c.req.valid("param").id }).catch((err) => console.error("filling ends failed", err));
      return c.body(null, 204);
    },
  )
  // Where a series is up to (started, or the next episode), or null to stop watching it for now;
  // `at` is for Undo (placeFields). Not once it's watched: a tick from a phone that hadn't heard
  // yet mustn't overwrite where it ended.
  .put(
    "/:id/progress",
    watchParam,
    zValidator("json", z.object({ progress: progress.nullable(), at: progressAt })),
    async (c) => {
      const { progress: place, at } = c.req.valid("json");
      await db
        .update(watch)
        .set(placeFields(place, at))
        .where(
          and(
            eq(watch.id, c.req.valid("param").id),
            eq(watch.householdId, c.var.householdId),
            eq(watch.kind, "series"), // a movie has no episodes
            isNull(watch.watchedAt),
          ),
        );
      notify(c.var.householdId, "watch");
      return c.body(null, 204);
    },
  )
  .delete("/:id", watchParam, async (c) => {
    await db.delete(watch).where(and(eq(watch.id, c.req.valid("param").id), eq(watch.householdId, c.var.householdId)));
    notify(c.var.householdId, "watch");
    return c.body(null, 204);
  });
