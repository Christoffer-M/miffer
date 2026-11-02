// What the to-watch screens share: Watch's shelves and each kind's See all page.
// The leading "-" keeps the router from taking this file for a route.

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useContext, useState } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Check, ChevronLeft, Dices, Play, Plus, Trash2 } from "lucide-react";
import type { Watch } from "../../api";
import { Button, buttonClass } from "../../components/Button";
import { UndoBar, UndoSpot, useUndo } from "../../components/UndoBar";
import { useRemoveWatch, useRestoreWatch, useSetProgress, useSetWatched } from "../../mutations/watch";
import { endOf, seen, seenText } from "../../progress";
import { useMembers } from "../../queries/household";
import { seasonsQuery, watchQuery } from "../../queries/watch";
import { animatedBlock, animatedItem } from "../../viewTransition";
import { addedIt, type Kind, KINDS, PosterTile, tileLabel, toStart, WatchSheet } from "../../watch";
import ui from "../../ui.module.css";
import g from "../groceries.module.css";
import s from "./watch.module.css";

/**
 * Tapping a poster to watch: its sheet, with Remove and Watched (and Start watching, for a
 * series), all with Undo. The screen shows `sheet` and `bottom` (Undo and the + button) after its list.
 */
export function useToWatch() {
  const { data: list = [] } = useQuery(watchQuery);
  const { whoIs } = useMembers();
  const offerUndoSpot = useContext(UndoSpot);
  const setWatched = useSetWatched();
  const removeWatch = useRemoveWatch();
  const restoreWatch = useRestoreWatch();
  const setProgress = useSetProgress();
  const undo = useUndo();
  // The poster tapped last; kept after closing so the sheet doesn't empty as it slides away.
  const [tapped, setTapped] = useState<{ item?: Watch; isOpen: boolean }>({ isOpen: false });
  const close = () => setTapped((t) => ({ ...t, isOpen: false }));
  // A series' seasons, fetched while its sheet is open, so Watched can remember where it ended.
  const { data: tappedSeasons } = useQuery(
    seasonsQuery(tapped.item?.kind === "series" ? tapped.item.tmdbId : null),
  );

  /**
   * Seen it all: a series remembers the end of its last season as it is now, so Watched can
   * tell when a new one comes, and says how many seasons that is. Undo puts it back on its
   * shelf, not started, as it was.
   */
  function watched(w: Watch) {
    close();
    const end = w.kind === "series" && w.id === tapped.item?.id ? endOf(tappedSeasons) : undefined;
    const part = end && seen(end, tappedSeasons);
    setWatched.mutate({ id: w.id, watched: true, place: end });
    undo.offer(`${w.title} is in Watched${part ? `, ${seenText(part)} seen` : ""}`, () => setWatched.mutate({ id: w.id, watched: false, place: null }));
  }

  function remove(w: Watch) {
    close();
    removeWatch.mutate(w.id);
    undo.offer(`Removed ${w.title}`, () => restoreWatch.mutate(w));
  }

  /** A series from the first episode: it leaves the shelf for Watching. */
  function start(w: Watch) {
    close();
    setProgress.mutate({ id: w.id, progress: { season: 1, episode: 1 } });
    undo.offer(`${w.title} is in Watching`, () => setProgress.mutate({ id: w.id, progress: null }));
  }

  const isSeries = tapped.item?.kind === "series";
  const sheet = tapped.item && (
    <WatchSheet
      // As it is now: someone may have changed it since it was tapped.
      item={list.find((w) => w.id === tapped.item!.id) ?? tapped.item}
      isOpen={tapped.isOpen}
      onClose={close}
      note={addedIt(whoIs(tapped.item.addedBy))}
      // A series' main button is Start watching, across the top; a movie's is Watched.
      actions={
        <>
          {isSeries && (
            <Button onPress={() => start(tapped.item!)} autoFocus>
              <Play size={18} aria-hidden />
              Start watching
            </Button>
          )}
          <Button variant="outline" onPress={() => remove(tapped.item!)}>
            <Trash2 size={18} aria-hidden />
            Remove
          </Button>
          <Button variant={isSeries ? "outline" : "primary"} onPress={() => watched(tapped.item!)} autoFocus={!isSeries}>
            <Check size={18} aria-hidden />
            Watched
          </Button>
        </>
      }
    />
  );

  // Undo floats above the tabs, beside the + button.
  const bottom = (
    <div className={`${s.undoBottom} ${s.withFab}`}>
      <div className={g.undoSlot} role="status">
        {undo.text && <UndoBar text={undo.text} onUndo={undo.run} />}
        {/* A due reminder's Undo goes here too. */}
        <div ref={offerUndoSpot} className={g.undoSpot} />
      </div>
      <Link to="/watch/add" className={s.fab} aria-label="Add a movie or series">
        <Plus size={28} aria-hidden />
      </Link>
    </div>
  );

  return { open: (item: Watch) => setTapped({ item, isOpen: true }), start, sheet, bottom };
}

/**
 * The dice: a movie or a series at random for tonight, and another if that's not it.
 * Let's watch on a series starts it, so it moves to Watching.
 */
export function Pick({ list, kind, onStart }: { list: Watch[]; kind: Kind; onStart: (w: Watch) => void }) {
  const { whoIs } = useMembers();
  const [pick, setPick] = useState<Watch>();
  const [isOpen, setOpen] = useState(false);
  const roll = () =>
    setPick((last) => {
      const others = list.filter((w) => w.id !== last?.id);
      return others[Math.floor(Math.random() * others.length)] ?? last;
    });

  return (
    <>
      <AriaButton
        className={s.action}
        aria-label={`Pick ${kind === "movie" ? "a movie" : "a series"} for tonight`}
        onPress={() => {
          roll();
          setOpen(true);
        }}
      >
        <Dices size={20} aria-hidden />
      </AriaButton>
      <WatchSheet
        item={pick}
        isOpen={isOpen}
        onClose={() => setOpen(false)}
        eyebrow="Tonight"
        note={pick ? addedIt(whoIs(pick.addedBy)) : ""}
        actions={
          <>
            <Button variant="outline" onPress={roll}>
              Another
            </Button>
            <Button
              onPress={() => {
                setOpen(false);
                if (pick?.kind === "series") onStart(pick);
              }}
              autoFocus
            >
              Let's watch
            </Button>
          </>
        }
      />
    </>
  );
}

/** See all: every movie (or series) to watch, three across, from a shelf on Watch. */
export function KindPage({ kind }: { kind: Kind }) {
  const { data: list = [], isPending, error } = useQuery(watchQuery);
  const { whoIs } = useMembers();
  const { open, start, sheet, bottom } = useToWatch();
  const { plural } = KINDS[kind];
  const shown = toStart(list, kind);

  return (
    <>
      <header className={g.header} data-vt="list-header">
        <Link to="/watch" className={`${buttonClass("text")} ${s.back}`}>
          <ChevronLeft size={18} aria-hidden />
          Watch
        </Link>
        <h1 className={ui.display}>{plural}</h1>
        <div className={`${ui.row} ${s.countRow}`}>
          <p className={ui.muted}>{shown.length} to watch</p>
          {shown.length > 0 && <Pick list={shown} kind={kind} onStart={start} />}
        </div>
      </header>

      <main className={`${ui.content} ${g.list}`}>
        {error && <p className={ui.error}>{error.message}</p>}
        {!isPending && shown.length === 0 && (
          <p className={`${ui.muted} ${g.empty}`}>No {plural.toLowerCase()} to watch. Tap + to add one.</p>
        )}
        {shown.length > 0 && (
          <ul className={s.grid} aria-label={`${plural} to watch`} {...animatedBlock("watch-grid")}>
            {shown.map((w) => (
              <li key={w.id} {...animatedItem(`watch-${w.id}`)}>
                <PosterTile item={w} label={tileLabel(w, `added by ${whoIs(w.addedBy)}`)} onPress={() => open(w)} />
              </li>
            ))}
          </ul>
        )}
      </main>

      {sheet}
      {bottom}
    </>
  );
}
