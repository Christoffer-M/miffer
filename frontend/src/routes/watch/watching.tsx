import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button as AriaButton, Group, Input, Label, NumberField } from "react-aria-components";
import { Check, ChevronLeft, CircleCheckBig, Minus, Plus, Undo2 } from "lucide-react";
import type { Watch } from "../../api";
import { Button, buttonClass } from "../../components/Button";
import { UndoBar } from "../../components/UndoBar";
import { useSetProgress, useSetWatched } from "../../mutations/watch";
import { isOffline } from "../../offline";
import { caughtUp, next, type Place, seasonParts, share } from "../../progress";
import { useMembers } from "../../queries/household";
import { seasonsQuery, watchQuery } from "../../queries/watch";
import { animatedBlock, animatedItem } from "../../viewTransition";
import { addedIt, byRecent, isWatching, Poster, WatchSheet } from "../../watch";
import ui from "../../ui.module.css";
import g from "../groceries.module.css";
import s from "./watch.module.css";

export const Route = createFileRoute("/watch/watching")({ component: Watching });

const UNDO_MS = 6000;

const placeOf = (w: Watch): Place => ({ season: w.season ?? 1, episode: w.episode ?? 1 });
const short = ({ season, episode }: Place) => `S${season} · E${episode}`;
const nextUpLabel = (w: Watch) => `${w.title}, next up season ${placeOf(w).season}, episode ${placeOf(w).episode}`;
const tickLabel = (w: Watch) =>
  `Watched season ${placeOf(w).season}, episode ${placeOf(w).episode} of ${w.title}`;

/** How far through a series is, in words: "14 of 28 episodes watched", when the seasons are known. */
function howFar(at: Place, seasons?: number[]) {
  if (caughtUp(at, seasons)) return "All caught up";
  const part = share(at, seasons);
  return part && `${part.watched} of ${part.total} episodes watched`;
}

/**
 * Series someone has started. The one watched last is big at the top, to pick up where you
 * left off; the others are rows under it, and caught-up ones wait at the bottom.
 */
function Watching() {
  const { data: list = [], isPending, error } = useQuery(watchQuery);
  const setProgress = useSetProgress();
  const setWatched = useSetWatched();
  const { whoIs } = useMembers();
  const [undo, setUndo] = useState<{ text: string; run: () => void } | null>(null);
  // The series tapped last; kept after closing so the sheet doesn't empty as it slides away.
  const [tapped, setTapped] = useState<{ item?: Watch; isOpen: boolean }>({ isOpen: false });
  const close = () => setTapped((t) => ({ ...t, isOpen: false }));

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  const shown = list.filter(isWatching).sort(byRecent);
  // Each series' seasons, to tell the caught-up ones apart.
  const seasonsOf = useQueries({
    queries: shown.map((w) => seasonsQuery(w.tmdbId)),
    combine: (results) => new Map(shown.map((w, i) => [w.id, results[i]?.data])),
  });
  const going = shown.filter((w) => !caughtUp(placeOf(w), seasonsOf.get(w.id)));
  const caught = shown.filter((w) => caughtUp(placeOf(w), seasonsOf.get(w.id)));
  const [hero, ...others] = going;

  // As it is now: someone may have changed it since it was tapped.
  const open = tapped.item && (list.find((w) => w.id === tapped.item!.id) ?? tapped.item);
  const { data: openSeasons } = useQuery(seasonsQuery(open?.tmdbId ?? null));
  const openTile = (w: Watch) => setTapped({ item: w, isOpen: true });

  function move(w: Watch, to: Place | null, text: string) {
    const from = placeOf(w);
    setProgress.mutate({ id: w.id, progress: to });
    if (!isOffline()) setUndo({ text, run: () => setProgress.mutate({ id: w.id, progress: from }) });
  }
  const tick = (w: Watch) =>
    move(w, next(placeOf(w), seasonsOf.get(w.id)), `Watched ${short(placeOf(w))} of ${w.title}`);

  function finished(w: Watch) {
    close();
    setWatched.mutate({ id: w.id, watched: true });
    if (!isOffline()) setUndo({ text: `${w.title} is in Watched`, run: () => setWatched.mutate({ id: w.id, watched: false }) });
  }

  return (
    <>
      <header className={g.header} data-vt="list-header">
        <Link to="/watch" className={`${buttonClass("text")} ${s.back}`}>
          <ChevronLeft size={18} aria-hidden />
          Watch
        </Link>
        <h1 className={ui.display}>Watching</h1>
      </header>

      <main className={`${ui.content} ${g.list} ${s.watching}`}>
        {error && <p className={ui.error}>{error.message}</p>}
        {!isPending && shown.length === 0 && (
          <p className={`${ui.muted} ${g.empty}`}>
            No series on the go. Tap a series on Watch and choose Start watching, and it shows up here.
          </p>
        )}

        {hero && (
          <Hero item={hero} seasons={seasonsOf.get(hero.id)} onOpen={() => openTile(hero)} onTick={() => tick(hero)} />
        )}

        {others.length > 0 && (
          <section aria-labelledby="also" {...animatedBlock("watching-others")}>
            <h2 id="also" className={`${ui.eyebrow} ${ui.muted} ${s.watchingHeading}`}>
              Also on the go
            </h2>
            <ul className={s.compactList}>
              {others.map((w) => (
                <li key={w.id} className={s.compactRow} {...animatedItem(`watching-${w.id}`)}>
                  <AriaButton className={s.compactOpen} onPress={() => openTile(w)} aria-label={nextUpLabel(w)}>
                    <Poster path={w.posterPath} kind={w.kind} size="tiny" />
                    <span className={s.compactTitle}>{w.title}</span>
                    <span className={s.compactPlace}>{short(placeOf(w))}</span>
                  </AriaButton>
                  <AriaButton className={s.tick} onPress={() => tick(w)} aria-label={tickLabel(w)}>
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
                const part = share(placeOf(w), seasonsOf.get(w.id));
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
      </main>

      {open && (
        <WatchSheet
          item={open}
          isOpen={tapped.isOpen}
          onClose={close}
          note={howFar(placeOf(open), openSeasons) || addedIt(whoIs(open.addedBy))}
          actions={
            <>
              <Button
                variant="outline"
                onPress={() => {
                  close();
                  move(open, null, `${open.title} is back on Watch`);
                }}
              >
                <Undo2 size={18} aria-hidden />
                Put back
              </Button>
              <Button onPress={() => finished(open)}>
                <CircleCheckBig size={18} aria-hidden />
                Finished
              </Button>
            </>
          }
        >
          {/* No Undo in here: tapping another episode, or −, puts it back. */}
          {openSeasons?.length ? (
            <EpisodePicker
              key={open.id}
              at={placeOf(open)}
              seasons={openSeasons}
              onChange={(to) => setProgress.mutate({ id: open.id, progress: to })}
            />
          ) : (
            <PlacePicker at={placeOf(open)} onChange={(to) => setProgress.mutate({ id: open.id, progress: to })} />
          )}
        </WatchSheet>
      )}

      <div className={s.undoBottom}>
        <div className={g.undoSlot} role="status">
          {undo && (
            <UndoBar
              text={undo.text}
              onUndo={() => {
                undo.run();
                if (!isOffline()) setUndo(null);
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}

type HeroProps = { item: Watch; seasons?: number[]; onOpen: () => void; onTick: () => void };

/** The series watched last: big, with how far through each season it is and one button for the next episode. */
function Hero({ item, seasons, onOpen, onTick }: HeroProps) {
  const at = placeOf(item);
  const part = share(at, seasons);
  return (
    <section className={s.hero} aria-label="Pick up where you left off" {...animatedItem(`watching-${item.id}`)}>
      <AriaButton className={s.heroOpen} onPress={onOpen} aria-label={`${nextUpLabel(item)}. Where you're up to`}>
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
      <Button onPress={onTick} aria-label={tickLabel(item)}>
        <Check size={18} strokeWidth={2.5} aria-hidden />
        Watched episode {at.episode}
      </Button>
    </section>
  );
}

/**
 * Where a series is up to, from TMDB's seasons: pick a season, then the last episode seen.
 * Watched ones are filled, the next one is outlined.
 */
function EpisodePicker({ at, seasons, onChange }: { at: Place; seasons: number[]; onChange: (to: Place) => void }) {
  // The season shown; it follows along when the place moves to another season.
  const [viewing, setViewing] = useState(Math.min(at.season, seasons.length));
  useEffect(() => setViewing(Math.min(at.season, seasons.length)), [at.season, seasons.length]);
  const parts = seasonParts(at, seasons);
  const done = caughtUp(at, seasons);

  return (
    <div className={s.places}>
      <span className={s.upNextBig}>{done ? "All caught up" : `Next up ${short(at)}`}</span>
      <div className={s.chips} role="group" aria-label="Seasons">
        {seasons.map((n, i) => {
          const season = i + 1;
          const complete = parts[i] === n;
          return (
            <AriaButton
              key={season}
              className={s.chip}
              data-selected={season === viewing || undefined}
              data-complete={complete || undefined}
              aria-pressed={season === viewing}
              aria-label={`Season ${season}${complete ? ", watched" : ""}`}
              onPress={() => setViewing(season)}
            >
              {complete && <Check size={14} strokeWidth={3} aria-hidden />}S{season}
            </AriaButton>
          );
        })}
      </div>
      <div className={s.pickerHead}>
        <span className={`${ui.eyebrow} ${ui.muted}`}>Season {viewing}</span>
        <span className={`${ui.muted} ${ui.small}`}>Tap the last one you saw</span>
      </div>
      <div className={s.episodes} role="group" aria-label={`Season ${viewing} episodes`}>
        {Array.from({ length: seasons[viewing - 1] ?? 0 }, (_, i) => {
          const episode = i + 1;
          const seen = episode <= parts[viewing - 1];
          const isNext = !seen && viewing === at.season && episode === at.episode;
          return (
            <AriaButton
              key={episode}
              className={s.episode}
              data-seen={seen || undefined}
              data-next={isNext || undefined}
              aria-label={`Episode ${episode}${seen ? ", watched" : isNext ? ", next up" : ""}`}
              onPress={() => onChange(next({ season: viewing, episode }, seasons))}
            >
              {episode}
            </AriaButton>
          );
        })}
      </div>
      <div className={s.legend} aria-hidden>
        <span>
          <span className={s.swatch} data-seen />
          Watched
        </span>
        <span>
          <span className={s.swatch} data-next />
          Next up
        </span>
        <span>
          <span className={s.swatch} />
          Still to come
        </span>
      </div>
    </div>
  );
}

/** Without TMDB's seasons (typed by hand, or offline): the next episode up, season and episode by hand. */
function PlacePicker({ at, onChange }: { at: Place; onChange: (to: Place) => void }) {
  return (
    <div className={s.places}>
      <span className={`${ui.eyebrow} ${ui.muted}`}>Next up</span>
      <div className={s.steppers}>
        <Stepper label="Season" value={at.season} onChange={(season) => onChange({ season, episode: 1 })} />
        <Stepper label="Episode" value={at.episode} onChange={(episode) => onChange({ season: at.season, episode })} />
      </div>
    </div>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <NumberField
      className={s.stepper}
      value={value}
      minValue={1}
      maxValue={label === "Season" ? 500 : 5000}
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
