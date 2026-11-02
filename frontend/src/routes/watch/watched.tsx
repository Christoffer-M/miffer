import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, Trash2, Undo2 } from "lucide-react";
import type { Watch } from "../../api";
import { Button, buttonClass } from "../../components/Button";
import { UndoBar, useUndo } from "../../components/UndoBar";
import { useRemoveWatch, useRestoreWatch, useSetWatched } from "../../mutations/watch";
import { watchQuery } from "../../queries/watch";
import { animatedBlock, animatedItem } from "../../viewTransition";
import { PosterTile, tileLabel, WatchSheet } from "../../watch";
import ui from "../../ui.module.css";
import g from "../groceries.module.css";
import s from "./watch.module.css";

export const Route = createFileRoute("/watch/watched")({ component: Watched });

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const month = new Intl.DateTimeFormat("en-GB", { month: "long" });
const monthAndYear = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

/** "November", or "November 2025" for an earlier year. */
function monthOf(date: Date) {
  return (date.getFullYear() === new Date().getFullYear() ? month : monthAndYear).format(date);
}

/** Watched ones, newest first, in a group per month. */
function byMonth(list: Watch[]) {
  const groups = new Map<string, Watch[]>();
  const watched = list.filter((w) => w.watchedAt).sort((a, b) => b.watchedAt!.localeCompare(a.watchedAt!));
  for (const w of watched) {
    const key = monthOf(new Date(w.watchedAt!));
    groups.set(key, [...(groups.get(key) ?? []), w]);
  }
  return [...groups];
}

function Watched() {
  const { data: list = [], isPending, error } = useQuery(watchQuery);
  const setWatched = useSetWatched();
  const removeWatch = useRemoveWatch();
  const restoreWatch = useRestoreWatch();
  const undo = useUndo();
  // The poster tapped last; kept after closing so the sheet doesn't empty as it slides away.
  const [tapped, setTapped] = useState<{ item?: Watch; isOpen: boolean }>({ isOpen: false });
  const close = () => setTapped((t) => ({ ...t, isOpen: false }));
  const watchedOn = (w: Watch) => `watched ${day.format(new Date(w.watchedAt!))}`;

  const groups = byMonth(list);
  const count = groups.reduce((n, [, ws]) => n + ws.length, 0);

  function putBack(w: Watch) {
    close();
    // Back on its shelf: a series starts over rather than going back to Watching.
    setWatched.mutate({ id: w.id, watched: false, restart: true });
  }
  function remove(w: Watch) {
    close();
    removeWatch.mutate(w.id);
    undo.offer(`Removed ${w.title}`, () => restoreWatch.mutate(w));
  }

  return (
    <>
      <header className={g.header} data-vt="list-header">
        <Link to="/watch" className={`${buttonClass("text")} ${s.back}`}>
          <ChevronLeft size={18} aria-hidden />
          Watch
        </Link>
        <h1 className={ui.display}>Watched</h1>
        <p className={ui.muted}>{count} so far</p>
      </header>

      <main className={`${ui.content} ${g.list}`}>
        {error && <p className={ui.error}>{error.message}</p>}
        {!isPending && count === 0 && (
          <p className={`${ui.muted} ${g.empty}`}>Nothing watched yet. Tap a poster on Watch and choose Watched, and it shows up here.</p>
        )}
        {groups.map(([name, ws]) => (
          <section key={name} aria-label={name}>
            <h2 className={`${ui.eyebrow} ${ui.muted} ${s.month}`} {...animatedBlock(`month-${name}`)}>
              {name}
            </h2>
            <ul className={s.grid} {...animatedBlock(`grid-${name}`)}>
              {ws.map((w) => (
                <li key={w.id} {...animatedItem(`watched-${w.id}`)}>
                  <PosterTile item={w} label={tileLabel(w, watchedOn(w))} onPress={() => setTapped({ item: w, isOpen: true })} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>

      {tapped.item && (
        <WatchSheet
          item={list.find((w) => w.id === tapped.item!.id) ?? tapped.item}
          isOpen={tapped.isOpen}
          onClose={close}
          note={tapped.item.watchedAt ? `Watched ${day.format(new Date(tapped.item.watchedAt))}` : ""}
          actions={
            <>
              <Button variant="outline" onPress={() => remove(tapped.item!)}>
                <Trash2 size={18} aria-hidden />
                Remove
              </Button>
              <Button onPress={() => putBack(tapped.item!)} autoFocus>
                <Undo2 size={18} aria-hidden />
                Put back
              </Button>
            </>
          }
        />
      )}

      <div className={s.undoBottom}>
        <div className={g.undoSlot} role="status">
          {undo.text && <UndoBar text={undo.text} onUndo={undo.run} />}
        </div>
      </div>
    </>
  );
}
