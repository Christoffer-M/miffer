import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button as AriaButton, Group, Input, Label, NumberField } from "react-aria-components";
import { Check, ChevronLeft, CircleCheckBig, Minus, Plus, Undo2 } from "lucide-react";
import type { Watch } from "../../api";
import { Button, buttonClass } from "../../components/Button";
import { UndoBar } from "../../components/UndoBar";
import { useSetProgress, useSetWatched } from "../../mutations/watch";
import { isOffline } from "../../offline";
import { caughtUp, next, type Place, share } from "../../progress";
import { useMembers } from "../../queries/household";
import { seasonsQuery, watchQuery } from "../../queries/watch";
import { animatedBlock, animatedItem } from "../../viewTransition";
import { addedIt, isWatching, Poster, WatchSheet } from "../../watch";
import ui from "../../ui.module.css";
import g from "../groceries.module.css";
import s from "./watch.module.css";

export const Route = createFileRoute("/watch/watching")({ component: Watching });

const UNDO_MS = 6000;

const placeOf = (w: Watch): Place => ({ season: w.season ?? 1, episode: w.episode ?? 1 });
const short = ({ season, episode }: Place) => `S${season} · E${episode}`;

/** How far through a series is, in words: "14 of 28 episodes watched", when the seasons are known. */
function howFar(at: Place, seasons?: number[]) {
  if (caughtUp(at, seasons)) return "All caught up";
  const part = share(at, seasons);
  return part && `${part.watched} of ${part.total} episodes watched`;
}

/** Series someone has started: where each is up to, and a tap to tick off the next episode. */
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

  const shown = list.filter(isWatching);
  // As it is now: someone may have changed it since it was tapped.
  const open = tapped.item && (list.find((w) => w.id === tapped.item!.id) ?? tapped.item);
  const { data: openSeasons } = useQuery(seasonsQuery(open?.tmdbId ?? null));

  function move(w: Watch, to: Place | null, text: string) {
    const from = placeOf(w);
    setProgress.mutate({ id: w.id, progress: to });
    if (!isOffline()) setUndo({ text, run: () => setProgress.mutate({ id: w.id, progress: from }) });
  }

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
        <p className={ui.muted}>{shown.length === 1 ? "1 series on the go" : `${shown.length} series on the go`}</p>
      </header>

      <main className={`${ui.content} ${g.list}`}>
        {error && <p className={ui.error}>{error.message}</p>}
        {!isPending && shown.length === 0 && (
          <p className={`${ui.muted} ${g.empty}`}>
            No series on the go. Tap a series on Watch and choose Start watching, and it shows up here.
          </p>
        )}
        {shown.length > 0 && (
          <ul className={s.watchingList} aria-label="Series being watched" {...animatedBlock("watching-list")}>
            {shown.map((w) => (
              <li key={w.id} {...animatedItem(`watching-${w.id}`)}>
                <WatchingRow
                  item={w}
                  onOpen={() => setTapped({ item: w, isOpen: true })}
                  onNext={(to) => move(w, to, `Watched ${short(placeOf(w))} of ${w.title}`)}
                />
              </li>
            ))}
          </ul>
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
          <PlacePicker
            at={placeOf(open)}
            seasons={openSeasons}
            // No Undo here: the buttons beside the number put it back.
            onChange={(to) => setProgress.mutate({ id: open.id, progress: to })}
          />
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

/** One series: poster, the next episode and how far through it is, and a tick for the next episode. */
function WatchingRow({ item, onOpen, onNext }: { item: Watch; onOpen: () => void; onNext: (to: Place) => void }) {
  const { data: seasons } = useQuery(seasonsQuery(item.tmdbId));
  const at = placeOf(item);
  const done = caughtUp(at, seasons);
  const part = share(at, seasons);

  return (
    <div className={s.watchingRow}>
      <AriaButton className={s.watchingOpen} onPress={onOpen} aria-label={`${item.title}, ${done ? "all caught up" : `next up season ${at.season}, episode ${at.episode}`}`}>
        <Poster path={item.posterPath} kind={item.kind} />
        <span className={s.text}>
          <strong>{item.title}</strong>
          <span className={s.upNext}>{done ? "All caught up" : `Next up ${short(at)}`}</span>
          {part && (
            <span className={s.howFar}>
              <span className={s.bar} aria-hidden>
                <span style={{ width: `${(100 * part.watched) / Math.max(1, part.total)}%` }} />
              </span>
              {part.watched}/{part.total}
            </span>
          )}
        </span>
      </AriaButton>
      {!done && (
        <AriaButton
          className={s.nextButton}
          aria-label={`Watched season ${at.season}, episode ${at.episode} of ${item.title}`}
          onPress={() => onNext(next(at, seasons))}
        >
          <Check size={22} aria-hidden />
        </AriaButton>
      )}
    </div>
  );
}

/** The next episode up, to set by hand: to start part way in, or to fix a tick too many. */
function PlacePicker({ at, seasons, onChange }: { at: Place; seasons?: number[]; onChange: (to: Place) => void }) {
  const inSeason = seasons?.[at.season - 1];
  return (
    <div className={s.places}>
      <span className={`${ui.eyebrow} ${ui.muted}`}>Next up</span>
      <div className={s.steppers}>
        <Stepper
          label="Season"
          value={at.season}
          max={seasons?.length || 500}
          onChange={(season) => onChange({ season, episode: 1 })}
        />
        <Stepper
          label="Episode"
          value={at.episode}
          // One past the last: caught up, waiting for more.
          max={inSeason !== undefined && at.season === seasons!.length ? inSeason + 1 : (inSeason ?? 5000)}
          onChange={(episode) => onChange({ season: at.season, episode })}
        />
      </div>
    </div>
  );
}

function Stepper({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (n: number) => void }) {
  return (
    <NumberField
      className={s.stepper}
      value={value}
      minValue={1}
      maxValue={Math.max(max, value)}
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
