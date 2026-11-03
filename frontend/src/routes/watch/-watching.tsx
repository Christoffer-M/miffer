// Series someone has started: the Watching tab on Series, and the card for it on Watch.
// The leading "-" keeps the router from taking this file for a route.

import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button as AriaButton, Group, Input, Label, NumberField } from "react-aria-components";
import { Check, ChevronDown, CircleCheckBig, Minus, Plus, Undo2 } from "lucide-react";
import type { Watch } from "../../api";
import { Button } from "../../components/Button";
import { useSetProgress, useSetWatched } from "../../mutations/watch";
import {
  caughtUp,
  endOf,
  finishedAt,
  MAX_EPISODE,
  MAX_SEASON,
  next,
  type Place,
  seasonParts,
  seen,
  seenText,
  share,
  short,
  tapEpisode,
} from "../../progress";
import { episodesQuery, seasonsQuery, watchQuery } from "../../queries/watch";
import { animatedBlock, animatedItem } from "../../viewTransition";
import { isWatching, placeOf, Poster, WatchSheet, watchingGroups } from "../../watch";
import ui from "../../ui.module.css";
import g from "../groceries.module.css";
import s from "./watch.module.css";

const nextUpLabel = (w: Watch, at: Place) => `${w.title}, next up season ${at.season}, episode ${at.episode}`;
const tickLabel = (w: Watch, at: Place) => `Watched season ${at.season}, episode ${at.episode} of ${w.title}`;

/** How far through a series is, in words: "14 of 28 episodes watched", when the seasons are known. */
function howFar(at: Place, seasons?: number[]) {
  if (caughtUp(at, seasons)) return "All caught up";
  const part = share(at, seasons);
  return part && `${part.watched} of ${part.total} episodes watched`;
}

/**
 * The series being watched, grouped as Watching shows them, with each one's seasons from TMDB
 * to tell the caught-up ones apart and to count episodes right.
 */
export function useWatching(list: Watch[]) {
  const shown = list.filter(isWatching);
  const seasonsById = useQueries({
    queries: shown.map((w) => seasonsQuery(w.tmdbId)),
    combine: (results) => new Map(shown.map((w, i) => [w.id, results[i]?.data])),
  });
  const seasonsOf = (w: Watch) => seasonsById.get(w.id);
  return { shown, seasonsOf, ...watchingGroups(list, seasonsOf) };
}

type Offer = (text: string, run: () => void) => void;

/**
 * Series' Watching tab. The one watched last is big at the top, to pick up where you left off;
 * the others are rows under it, and caught-up ones wait at the bottom. Undo is the screen's.
 */
export function WatchingPanel({ offer }: { offer: Offer }) {
  const { data: list = [], isPending, error } = useQuery(watchQuery);
  const setProgress = useSetProgress();
  const setWatched = useSetWatched();
  // The series tapped last; kept after closing so the sheet doesn't empty as it slides away.
  const [tapped, setTapped] = useState<{ item?: Watch; isOpen: boolean }>({ isOpen: false });
  const close = () => setTapped((t) => ({ ...t, isOpen: false }));

  const { shown, seasonsOf, hero, others, caught } = useWatching(list);
  const at = (w: Watch) => placeOf(w, seasonsOf(w));

  // As it is now: someone may have changed it since it was tapped.
  const open = tapped.item && (list.find((w) => w.id === tapped.item!.id) ?? tapped.item);
  const { data: openSeasons } = useQuery(seasonsQuery(open?.tmdbId ?? null));
  const openTile = (w: Watch) => setTapped({ item: w, isOpen: true });

  function move(w: Watch, to: Place | null, text: string) {
    // As stored, to put back exactly: in the same spot on Watching too.
    const from = { season: w.season ?? 1, episode: w.episode ?? 1 };
    setProgress.mutate({ id: w.id, progress: to });
    offer(text, () => setProgress.mutate({ id: w.id, progress: from, at: w.progressAt }));
  }
  const tick = (w: Watch) => move(w, next(at(w), seasonsOf(w)), `Watched ${short(at(w))} of ${w.title}`);

  /**
   * Seen it all: it remembers the end of its last season, so Watched says how many seasons that
   * is and can tell when a new one comes. From search with the seasons not loaded yet, it goes
   * without a place and the server fills in the end (watched.ts); typed by hand, the season it's
   * in counts as done.
   */
  function finished(w: Watch, seasons?: number[]) {
    close();
    const was = { season: w.season ?? 1, episode: w.episode ?? 1 };
    const end = endOf(seasons) ?? (w.tmdbId === null ? finishedAt(was) : undefined);
    const part = end && seen(end, seasons);
    setWatched.mutate({ id: w.id, watched: true, place: end });
    // Back on Watching where it was, in the same spot.
    offer(`${w.title} is in Watched${part ? `, ${seenText(part)} seen` : ""}`, () =>
      setWatched.mutate({ id: w.id, watched: false, place: was, at: w.progressAt }),
    );
  }

  return (
    <>
      {error && <p className={ui.error}>{error.message}</p>}
      {!isPending && shown.length === 0 && (
        <p className={`${ui.muted} ${g.empty}`}>
          Not watching any series. Tap one under To start and choose Start watching, and it shows up here.
        </p>
      )}

      {hero && (
        <Hero item={hero} seasons={seasonsOf(hero)} onOpen={() => openTile(hero)} onTick={() => tick(hero)} />
      )}

      {others.length > 0 && (
        <section aria-labelledby="also" {...animatedBlock("watching-others")}>
          <h2 id="also" className={`${ui.eyebrow} ${ui.muted} ${s.watchingHeading}`}>
            Also watching
          </h2>
          <ul className={s.compactList}>
            {others.map((w) => (
              <li key={w.id} className={s.compactRow} {...animatedItem(`watching-${w.id}`)}>
                <AriaButton className={s.compactOpen} onPress={() => openTile(w)} aria-label={nextUpLabel(w, at(w))}>
                  <Poster path={w.posterPath} kind={w.kind} size="tiny" />
                  <span className={s.compactTitle}>{w.title}</span>
                  <span className={s.compactPlace}>{short(at(w))}</span>
                </AriaButton>
                <AriaButton className={s.tick} onPress={() => tick(w)} aria-label={tickLabel(w, at(w))}>
                  <Check size={20} strokeWidth={2.5} aria-hidden />
                </AriaButton>
              </li>
            ))}
          </ul>
        </section>
      )}

      {caught.length > 0 && (
        <section aria-labelledby="caught" {...animatedBlock("watching-caught")}>
          <h2 id="caught" className={`${ui.eyebrow} ${ui.muted} ${s.watchingHeading}`}>
            Caught up
          </h2>
          <ul className={s.compactList}>
            {caught.map((w) => {
              const part = share(at(w), seasonsOf(w));
              return (
                <li key={w.id} className={s.compactRow} {...animatedItem(`watching-${w.id}`)}>
                  <AriaButton className={s.compactOpen} onPress={() => openTile(w)} aria-label={`${w.title}, all caught up`}>
                    <Poster path={w.posterPath} kind={w.kind} size="tiny" />
                    <span className={s.text}>
                      <span className={s.compactTitle}>{w.title}</span>
                      <span className={`${ui.muted} ${ui.small}`}>
                        {part ? `All ${part.total} episodes seen` : "All caught up"}
                      </span>
                    </span>
                  </AriaButton>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {open && (
        <WatchSheet
          item={open}
          isOpen={tapped.isOpen}
          onClose={close}
          note={howFar(placeOf(open, openSeasons), openSeasons) || undefined}
          actions={
            <>
              <Button
                variant="outline"
                onPress={() => {
                  close();
                  move(open, null, `${open.title} is back in To start`);
                }}
              >
                <Undo2 size={18} aria-hidden />
                Put back
              </Button>
              <Button onPress={() => finished(open, openSeasons)}>
                <CircleCheckBig size={18} aria-hidden />
                Finished
              </Button>
            </>
          }
        >
          {/* No Undo in here: tapping an episode again, or −, puts it back. */}
          {openSeasons?.length ? (
            <SeasonList
              key={open.id}
              tmdbId={open.tmdbId}
              at={placeOf(open, openSeasons)}
              seasons={openSeasons}
              onChange={(to) => setProgress.mutate({ id: open.id, progress: to })}
            />
          ) : (
            <PlacePicker at={placeOf(open)} onChange={(to) => setProgress.mutate({ id: open.id, progress: to })} />
          )}
        </WatchSheet>
      )}
    </>
  );
}

type HeroProps = { item: Watch; seasons?: number[]; onOpen: () => void; onTick: () => void };

/** The series watched last: big, with how far through each season it is and one button for the next episode. */
function Hero({ item, seasons, onOpen, onTick }: HeroProps) {
  const at = placeOf(item, seasons);
  const part = share(at, seasons);
  return (
    <section className={s.hero} aria-label="Pick up where you left off" {...animatedItem(`watching-${item.id}`)}>
      <AriaButton className={s.heroOpen} onPress={onOpen} aria-label={`${nextUpLabel(item, at)}. Where you're up to`}>
        <Poster path={item.posterPath} kind={item.kind} size="medium" />
        <span className={s.heroText}>
          <span className={ui.eyebrow}>Pick up where you left off</span>
          <span className={s.heroTitle}>{item.title}</span>
          <span className={s.heroPlace}>
            Season {at.season} · Episode {at.episode}
          </span>
          {part && (
            <span className={`${ui.muted} ${ui.small}`}>
              {part.watched} of {part.total} episodes watched
            </span>
          )}
        </span>
      </AriaButton>
      {seasons && (
        <span className={s.segments} aria-hidden>
          {seasonParts(at, seasons).map((seen, i) => (
            <span key={i} className={s.segment} style={{ flexGrow: seasons[i] }}>
              <span style={{ width: `${(100 * seen) / Math.max(1, seasons[i])}%` }} />
            </span>
          ))}
        </span>
      )}
      <Button onPress={onTick} aria-label={tickLabel(item, at)}>
        <Check size={18} strokeWidth={2.5} aria-hidden />
        Watched episode {at.episode}
      </Button>
    </section>
  );
}

type SeasonListProps = { tmdbId: number | null; at: Place; seasons: number[]; onChange: (to: Place) => void };

/**
 * Where a series is up to, from TMDB's seasons: a row per season saying how far it is, and the
 * open one's episodes by name. Tapping an episode makes it the last one seen; tapping the last
 * one seen again unmarks it.
 */
function SeasonList({ tmdbId, at, seasons, onChange }: SeasonListProps) {
  // The season open, 0 for none; it follows along when the place moves to another season.
  const [open, setOpen] = useState(Math.min(at.season, seasons.length));
  useEffect(() => setOpen(Math.min(at.season, seasons.length)), [at.season, seasons.length]);
  const parts = seasonParts(at, seasons);
  const list = useRef<HTMLDivElement>(null);

  // Moved on to another season (its last episode ticked): the sheet scrolls to that season's
  // first unwatched episode, just far enough to show it and the one after. Not on opening: the
  // sheet starts at the top, with the poster.
  const placed = useRef(at.season);
  useEffect(() => {
    if (placed.current === at.season || open !== at.season) return;
    placed.current = at.season;
    const body = list.current?.closest<HTMLElement>(`.${s.infoBody}`);
    const first = list.current?.querySelector<HTMLElement>(`.${s.episodeRow}:not([data-seen])`);
    if (!body || !first) return;
    const view = body.getBoundingClientRect();
    const row = first.getBoundingClientRect();
    if (row.top - row.height < view.top) body.scrollTop -= view.top - first.closest(`.${s.season}`)!.getBoundingClientRect().top;
    else if (row.bottom + row.height > view.bottom) body.scrollTop += row.bottom + row.height - view.bottom;
  }, [at.season, open]);

  return (
    <div className={s.places}>
      <div className={s.seasons} ref={list}>
        {seasons.map((n, i) => {
          const season = i + 1;
          const isOpen = season === open;
          const complete = parts[i] === n;
          const started = !complete && parts[i] > 0;
          const status = complete ? "Watched" : started ? `${parts[i]} of ${n}` : `${n} episodes`;
          return (
            <div key={season} className={s.season}>
              <AriaButton
                className={s.seasonRow}
                data-open={isOpen || undefined}
                data-complete={complete || undefined}
                data-started={started || undefined}
                aria-expanded={isOpen}
                onPress={() => setOpen(isOpen ? 0 : season)}
              >
                <span className={s.seasonName}>Season {season}</span>
                <span className={s.seasonStatus}>
                  {complete && <Check size={14} strokeWidth={3} aria-hidden />}
                  {status}
                </span>
                <ChevronDown className={s.chevron} size={18} strokeWidth={2.5} aria-hidden />
              </AriaButton>
              {isOpen && <Episodes tmdbId={tmdbId} season={season} at={at} seasons={seasons} onChange={onChange} />}
            </div>
          );
        })}
      </div>
      <span className={`${ui.muted} ${ui.small}`}>Tap the last episode you watched, again to unmark.</span>
    </div>
  );
}

/** A season's episodes, by name once TMDB has them; numbers alone before that, or offline. */
function Episodes({ tmdbId, season, at, seasons, onChange }: SeasonListProps & { season: number }) {
  const { data: names } = useQuery(episodesQuery(tmdbId, season));
  const seenUpTo = seasonParts(at, seasons)[season - 1];
  return (
    <ol className={s.episodeList} aria-label={`Season ${season} episodes`}>
      {Array.from({ length: seasons[season - 1] }, (_, i) => {
        const episode = i + 1;
        const name = names?.[i];
        const seen = episode <= seenUpTo;
        const tapTo = tapEpisode(at, { season, episode }, seasons);
        const isLastSeen = seen && tapTo.season === season && tapTo.episode === episode;
        return (
          <li key={episode}>
            <AriaButton
              className={s.episodeRow}
              data-seen={seen || undefined}
              aria-label={`Episode ${episode}${name ? `, ${name}` : ""}${isLastSeen ? ", the last one watched: tap to unmark" : seen ? ", watched" : ""}`}
              onPress={() => onChange(tapTo)}
            >
              <span className={s.episodeNumber}>{episode}</span>
              <span className={s.episodeName}>{name || `Episode ${episode}`}</span>
            </AriaButton>
          </li>
        );
      })}
    </ol>
  );
}

/** Without TMDB's seasons (typed by hand, or offline): the next episode up, season and episode by hand. */
function PlacePicker({ at, onChange }: { at: Place; onChange: (to: Place) => void }) {
  return (
    <div className={s.places}>
      <span className={`${ui.eyebrow} ${ui.muted}`}>Next up</span>
      <div className={s.steppers}>
        <Stepper label="Season" value={at.season} max={MAX_SEASON} onChange={(season) => onChange({ season, episode: 1 })} />
        <Stepper
          label="Episode"
          value={at.episode}
          max={MAX_EPISODE}
          onChange={(episode) => onChange({ season: at.season, episode })}
        />
      </div>
    </div>
  );
}

type StepperProps = { label: string; value: number; max: number; onChange: (n: number) => void };

function Stepper({ label, value, max, onChange }: StepperProps) {
  return (
    <NumberField
      className={s.stepper}
      value={value}
      minValue={1}
      maxValue={max}
      step={1}
      onChange={(n) => {
        if (Number.isInteger(n) && n !== value) onChange(n);
      }}
    >
      <Label className={s.stepperLabel}>{label}</Label>
      <Group className={s.stepperGroup}>
        <AriaButton slot="decrement" className={s.stepButton}>
          <Minus size={18} aria-hidden />
        </AriaButton>
        <Input className={s.stepInput} inputMode="numeric" />
        <AriaButton slot="increment" className={s.stepButton}>
          <Plus size={18} aria-hidden />
        </AriaButton>
      </Group>
    </NumberField>
  );
}
