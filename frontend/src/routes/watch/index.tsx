import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useContext, useEffect, useState } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Check, Dices, History, Plus, Trash2 } from "lucide-react";
import type { Watch } from "../../api";
import { Avatars } from "../../brand";
import { Button } from "../../components/Button";
import { UndoBar, UndoSpot } from "../../components/UndoBar";
import { useRemoveWatch, useRestoreWatch, useSetWatched } from "../../mutations/watch";
import { isOffline, useOnline } from "../../offline";
import { useMembers } from "../../queries/household";
import { watchQuery } from "../../queries/watch";
import { animatedBlock, animatedItem } from "../../viewTransition";
import { addedIt, PosterTile, tileLabel, WatchSheet } from "../../watch";
import ui from "../../ui.module.css";
import g from "../groceries.module.css";
import s from "./watch.module.css";

export const Route = createFileRoute("/watch/")({ component: WatchList });

/** How long Undo stays up, as for groceries. */
const UNDO_MS = 6000;

function WatchList() {
  const { data: list = [], isPending, error } = useQuery(watchQuery);
  const online = useOnline();
  const { whoIs } = useMembers();
  const offerUndoSpot = useContext(UndoSpot);
  const setWatched = useSetWatched();
  const removeWatch = useRemoveWatch();
  const restoreWatch = useRestoreWatch();
  // The last thing done that can be undone. A new one takes its place.
  const [undo, setUndo] = useState<{ text: string; run: () => void } | null>(null);
  // The poster tapped last; kept after closing so the sheet doesn't empty as it slides away.
  const [tapped, setTapped] = useState<{ item?: Watch; isOpen: boolean }>({ isOpen: false });
  const close = () => setTapped((t) => ({ ...t, isOpen: false }));

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  const toWatch = list.filter((w) => !w.watchedAt);
  const watchedCount = list.length - toWatch.length;

  function watched(w: Watch) {
    close();
    setWatched.mutate({ id: w.id, watched: true });
    if (!isOffline()) setUndo({ text: `${w.title} is in Watched`, run: () => setWatched.mutate({ id: w.id, watched: false }) });
  }

  function remove(w: Watch) {
    close();
    removeWatch.mutate(w.id);
    if (!isOffline()) setUndo({ text: `Removed ${w.title}`, run: () => restoreWatch.mutate(w) });
  }

  return (
    <>
      <header className={g.header} data-vt="list-header">
        <div className={ui.row}>
          <span className={ui.eyebrow}>miffer</span>
          <span className={`${g.badge} ${online ? g.synced : g.offline}`}>{online ? "Synced" : "Offline"}</span>
        </div>
        <div className={`${ui.row} ${g.titleRow}`}>
          <h1 className={ui.display}>Watch</h1>
          <Avatars />
        </div>
        <div className={`${ui.row} ${s.countRow}`}>
          <p className={ui.muted}>{toWatch.length} to watch</p>
          <div className={s.actions}>
            {toWatch.length > 0 && <Pick list={toWatch} />}
            <Link to="/watch/watched" className={s.action} aria-label={`Watched, ${watchedCount}`}>
              <History size={20} aria-hidden />
              {watchedCount}
            </Link>
          </div>
        </div>
      </header>

      <main className={`${ui.content} ${g.list}`}>
        {error && <p className={ui.error}>{error.message}</p>}
        {!isPending && toWatch.length === 0 && (
          <p className={`${ui.muted} ${g.empty}`}>Nothing to watch yet. Tap + to add a movie or series.</p>
        )}
        {toWatch.length > 0 && (
          <ul className={s.grid} aria-label="To watch" {...animatedBlock("watch-grid")}>
            {toWatch.map((w) => (
              <li key={w.id} {...animatedItem(`watch-${w.id}`)}>
                <PosterTile
                  item={w}
                  label={tileLabel(w, `added by ${whoIs(w.addedBy)}`)}
                  onPress={() => setTapped({ item: w, isOpen: true })}
                />
              </li>
            ))}
          </ul>
        )}
      </main>

      {tapped.item && (
        <WatchSheet
          // As it is now: someone may have changed it since it was tapped.
          item={list.find((w) => w.id === tapped.item!.id) ?? tapped.item}
          isOpen={tapped.isOpen}
          onClose={close}
          note={addedIt(whoIs(tapped.item.addedBy))}
          actions={
            <>
              <Button variant="outline" onPress={() => remove(tapped.item!)}>
                <Trash2 size={18} aria-hidden />
                Remove
              </Button>
              <Button onPress={() => watched(tapped.item!)} autoFocus>
                <Check size={18} aria-hidden />
                Watched
              </Button>
            </>
          }
        />
      )}

      {/* Undo floats above the tabs, beside the + button. */}
      <div className={`${s.undoBottom} ${s.withFab}`}>
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
          {/* A due reminder's Undo goes here too. */}
          <div ref={offerUndoSpot} className={g.undoSpot} />
        </div>
        <Link to="/watch/add" className={s.fab} aria-label="Add a movie or series">
          <Plus size={28} aria-hidden />
        </Link>
      </div>
    </>
  );
}

/** The dice: one at random for tonight, and another if that's not it. */
function Pick({ list }: { list: Watch[] }) {
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
        aria-label="Pick one for tonight"
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
            <Button onPress={() => setOpen(false)} autoFocus>
              Let's watch
            </Button>
          </>
        }
      />
    </>
  );
}
