import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, Play, Trash2, Undo2 } from "lucide-react";
import type { Watch } from "../../api";
import { Button, buttonClass } from "../../components/Button";
import { UndoBar, useUndo } from "../../components/UndoBar";
import { useRemoveWatch, useRestoreWatch, useSetWatched } from "../../mutations/watch";
import type { Place } from "../../progress";
import { useNewEpisodes, watchQuery } from "../../queries/watch";
import { animatedBlock, animatedItem } from "../../viewTransition";
import { PosterTile, tileLabel, WatchSheet } from "../../watch";
import ui from "../../ui.module.css";
import g from "../groceries.module.css";
import s from "./watch.module.css";

export const Route = createFileRoute("/watch/watched")({ component: Watched });

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const month = new Intl.DateTimeFormat("en-GB", { month: "long" });
const monthAndYear = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

const short = ({ season, episode }: Place) => `S${season} · E${episode}`;

/** "November", or "November 2025" for an earlier year. */
function monthOf(date: Date) {
  return (date.getFullYear() === new Date().getFullYear() ? month : monthAndYear).format(date);
}

/** Watched ones, newest first, in a group per month. */
function byMonth(watched: Watch[]) {
  const groups = new Map<string, Watch[]>();
  for (const w of [...watched].sort((a, b) => b.watchedAt!.localeCompare(a.watchedAt!))) {
    const key = monthOf(new Date(w.watchedAt!));
    groups.set(key, [...(groups.get(key) ?? []), w]);
  }
  return [...groups];
}

/**
 * What's been watched, by month. Series with new episodes since (a new season on TMDB) come
 * first, to go on with from there.
 */
function Watched() {
  const { data: list = [], isPending, error } = useQuery(watchQuery);
  const fresh = useNewEpisodes(list);
  const setWatched = useSetWatched();
  const removeWatch = useRemoveWatch();
  const restoreWatch = useRestoreWatch();
  const undo = useUndo();
  // The poster tapped last; kept after closing so the sheet doesn't empty as it slides away.
  const [tapped, setTapped] = useState<{ item?: Watch; isOpen: boolean }>({ isOpen: false });
  const close = () => setTapped((t) => ({ ...t, isOpen: false }));
  const watchedOn = (w: Watch) => `watched ${day.format(new Date(w.watchedAt!))}`;

  const watched = list.filter((w) => w.watchedAt);
  const withNew = watched.filter((w) => fresh.has(w.id));
  const groups = byMonth(watched.filter((w) => !fresh.has(w.id)));

  const open = tapped.item && (list.find((w) => w.id === tapped.item!.id) ?? tapped.item);
  const openNew = open && fresh.get(open.id);

  /** Back on its shelf: a series starts over rather than going back to Watching. */
  function putBack(w: Watch) {
    close();
    setWatched.mutate({ id: w.id, watched: false, place: null });
  }
  /** On to the new episodes: back on Watching, at the first of them. */
  function goOn(w: Watch, place: Place) {
    close();
    const ended = { season: w.season!, episode: w.episode! };
    setWatched.mutate({ id: w.id, watched: false, place });
    undo.offer(`${w.title} is in Watching`, () => setWatched.mutate({ id: w.id, watched: true, place: ended }));
  }
  function remove(w: Watch) {
    close();
    removeWatch.mutate(w.id);
    undo.offer(`Removed ${w.title}`, () => restoreWatch.mutate(w));
  }

  const tile = (w: Watch, name: string) => {
    const tag = fresh.get(w.id)?.label;
    return (
      <li key={w.id} {...animatedItem(`${name}-${w.id}`)}>
        <PosterTile
          item={w}
          tag={tag}
          label={tileLabel(w, tag ? `${tag.toLowerCase()}, ${watchedOn(w)}` : watchedOn(w))}
          onPress={() => setTapped({ item: w, isOpen: true })}
        />
      </li>
    );
  };

  return (
    <>
      <header className={g.header} data-vt="list-header">
        <Link to="/watch" className={`${buttonClass("text")} ${s.back}`}>
          <ChevronLeft size={18} aria-hidden />
          Watch
        </Link>
        <h1 className={ui.display}>Watched</h1>
        <p className={ui.muted}>{watched.length} so far</p>
      </header>

      <main className={`${ui.content} ${g.list}`}>
        {error && <p className={ui.error}>{error.message}</p>}
        {!isPending && watched.length === 0 && (
          <p className={`${ui.muted} ${g.empty}`}>Nothing watched yet. Tap a poster on Watch and choose Watched, and it shows up here.</p>
        )}
        {withNew.length > 0 && (
          <section aria-labelledby="new-episodes">
            <h2 id="new-episodes" className={`${ui.eyebrow} ${s.month}`} {...animatedBlock("month-new")}>
              New episodes
            </h2>
            <ul className={s.grid} {...animatedBlock("grid-new")}>
              {withNew.map((w) => tile(w, "watched"))}
            </ul>
          </section>
        )}
        {groups.map(([name, ws]) => (
          <section key={name} aria-label={name}>
            <h2 className={`${ui.eyebrow} ${ui.muted} ${s.month}`} {...animatedBlock(`month-${name}`)}>
              {name}
            </h2>
            <ul className={s.grid} {...animatedBlock(`grid-${name}`)}>
              {ws.map((w) => tile(w, "watched"))}
            </ul>
          </section>
        ))}
      </main>

      {open && (
        <WatchSheet
          item={open}
          isOpen={tapped.isOpen}
          onClose={close}
          note={
            openNew
              ? `${openNew.label}: ${short(openNew.place)} is next`
              : open.watchedAt
                ? `Watched ${day.format(new Date(open.watchedAt))}`
                : ""
          }
          actions={
            openNew ? (
              <>
                <Button onPress={() => goOn(open, openNew.place)} autoFocus>
                  <Play size={18} aria-hidden />
                  Continue at {short(openNew.place)}
                </Button>
                <Button variant="outline" onPress={() => remove(open)}>
                  <Trash2 size={18} aria-hidden />
                  Remove
                </Button>
                <Button variant="outline" onPress={() => putBack(open)}>
                  <Undo2 size={18} aria-hidden />
                  Start over
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onPress={() => remove(open)}>
                  <Trash2 size={18} aria-hidden />
                  Remove
                </Button>
                <Button onPress={() => putBack(open)} autoFocus>
                  <Undo2 size={18} aria-hidden />
                  Put back
                </Button>
              </>
            )
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
