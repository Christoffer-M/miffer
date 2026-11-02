import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { Tab, TabList, TabPanel, Tabs } from "react-aria-components";
import { ChevronLeft, Play, Trash2, Undo2 } from "lucide-react";
import type { Watch } from "../../api";
import { Button, buttonClass } from "../../components/Button";
import { UndoBar, useUndo } from "../../components/UndoBar";
import { useRemoveWatch, useRestoreWatch, useSetWatched } from "../../mutations/watch";
import { type Place, seenShort, seenText, short } from "../../progress";
import { useWatchedSeries, watchQuery } from "../../queries/watch";
import { animatedBlock, animatedItem } from "../../viewTransition";
import { type Kind, KINDS, PosterTile, tileLabel, WatchSheet } from "../../watch";
import ui from "../../ui.module.css";
import g from "../groceries.module.css";
import s from "./watch.module.css";

export const Route = createFileRoute("/watch/watched")({
  // Which kind is shown: movies unless asked for series (Watch asks when there are new episodes).
  validateSearch: (search: Record<string, unknown>): { kind?: Kind } =>
    search.kind === "series" || search.kind === "movie" ? { kind: search.kind } : {},
  component: Watched,
});

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const month = new Intl.DateTimeFormat("en-GB", { month: "long" });
const monthAndYear = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

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
 * What's been watched, movies and series apart, each by month. Series with new episodes since
 * (a new season on TMDB) come first, to go on with from there.
 */
function Watched() {
  const { data: list = [], isPending, error } = useQuery(watchQuery);
  const kind = Route.useSearch().kind ?? "movie";
  const navigate = useNavigate();
  // New episodes since, and how much of each was seen, to know where you were when they come.
  const { fresh, seen } = useWatchedSeries(list);
  const setWatched = useSetWatched();
  const removeWatch = useRemoveWatch();
  const restoreWatch = useRestoreWatch();
  const undo = useUndo();
  // The poster tapped last; kept after closing so the sheet doesn't empty as it slides away.
  const [tapped, setTapped] = useState<{ item?: Watch; isOpen: boolean }>({ isOpen: false });
  const close = () => setTapped((t) => ({ ...t, isOpen: false }));
  const watchedOn = (w: Watch) => `watched ${day.format(new Date(w.watchedAt!))}`;
  /** "3 seasons", when it's known how much of a series was seen. */
  const seenOf = (w: Watch) => {
    const part = seen.get(w.id);
    return part && seenText(part);
  };

  const watched = list.filter((w) => w.watchedAt);
  const ofKind = (k: Kind) => watched.filter((w) => w.kind === k);

  const open = tapped.item && (list.find((w) => w.id === tapped.item!.id) ?? tapped.item);
  const openNew = open && fresh.get(open.id);
  const openSeen = open && seenOf(open);

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
    undo.offer(`${w.title} is in Watching`, () => setWatched.mutate({ id: w.id, watched: true, place: ended, at: w.progressAt }));
  }
  function remove(w: Watch) {
    close();
    removeWatch.mutate(w.id);
    undo.offer(`Removed ${w.title}`, () => restoreWatch.mutate(w));
  }

  const tile = (w: Watch) => {
    const tag = fresh.get(w.id)?.label;
    const part = seen.get(w.id);
    const notes = [part && `${seenText(part)} seen`, tag?.toLowerCase(), watchedOn(w)];
    return (
      <li key={w.id} {...animatedItem(`watched-${w.id}`)}>
        <PosterTile
          item={w}
          sub={part && seenShort(part)}
          tag={tag}
          label={tileLabel(w, notes.filter(Boolean).join(", "))}
          onPress={() => setTapped({ item: w, isOpen: true })}
        />
      </li>
    );
  };

  return (
    <>
      <header className={`${g.header} ${s.tabbedHeader}`} data-vt="list-header">
        <Link to="/watch" className={`${buttonClass("text")} ${s.back}`}>
          <ChevronLeft size={18} aria-hidden />
          Watch
        </Link>
        <h1 className={ui.display}>Watched</h1>
        <p className={ui.muted}>{watched.length} so far</p>
      </header>

      <Tabs
        className={s.tabs}
        selectedKey={kind}
        onSelectionChange={(k) => navigate({ to: "/watch/watched", search: { kind: k as Kind }, replace: true })}
      >
        <TabList aria-label="Movies or series" className={s.kindTabs}>
          {(["movie", "series"] as const).map((k) => {
            const { plural, Icon } = KINDS[k];
            const hasNew = k === "series" && fresh.size > 0;
            return (
              <Tab key={k} id={k} className={s.kindTab} aria-label={`${plural}, ${ofKind(k).length}${hasNew ? `, ${fresh.size} with new episodes` : ""}`}>
                <span className={s.iconWithDot}>
                  <Icon size={18} aria-hidden />
                  {hasNew && <span className={s.dot} />}
                </span>
                {plural}
                <span className={s.kindCount}>{ofKind(k).length}</span>
              </Tab>
            );
          })}
        </TabList>

        {(["movie", "series"] as const).map((k) => (
          <TabPanel key={k} id={k} className={`${ui.content} ${g.list}`}>
            {error && <p className={ui.error}>{error.message}</p>}
            {!isPending && ofKind(k).length === 0 && (
              <p className={`${ui.muted} ${g.empty}`}>
                No {KINDS[k].plural.toLowerCase()} watched yet. Tap a poster on Watch and choose Watched, and it shows up here.
              </p>
            )}
            {k === "series" && <NewEpisodes list={ofKind(k).filter((w) => fresh.has(w.id))} tile={tile} />}
            {byMonth(ofKind(k).filter((w) => !fresh.has(w.id))).map(([name, ws]) => (
              <section key={name} aria-label={name} className={s.monthSection}>
                <h2 className={`${ui.eyebrow} ${ui.muted} ${s.month}`} {...animatedBlock(`month-${k}-${name}`)}>
                  {name}
                </h2>
                <ul className={s.grid} {...animatedBlock(`grid-${k}-${name}`)}>
                  {ws.map((w) => tile(w))}
                </ul>
              </section>
            ))}
          </TabPanel>
        ))}
      </Tabs>

      {open && (
        <WatchSheet
          item={open}
          isOpen={tapped.isOpen}
          onClose={close}
          note={[
            openSeen && `Seen ${openSeen}`,
            openNew
              ? `${openNew.label}: ${short(openNew.place)} is next`
              : open.watchedAt && `Watched ${day.format(new Date(open.watchedAt))}`,
          ]
            .filter(Boolean)
            .join(". ")}
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

/** Series with new episodes since they were watched, before the months. */
function NewEpisodes({ list, tile }: { list: Watch[]; tile: (w: Watch) => ReactNode }) {
  if (!list.length) return null;
  return (
    <section aria-labelledby="new-episodes" className={s.monthSection}>
      <h2 id="new-episodes" className={`${ui.eyebrow} ${s.month}`} {...animatedBlock("month-new")}>
        New episodes
      </h2>
      <ul className={s.grid} {...animatedBlock("grid-new")}>
        {list.map(tile)}
      </ul>
    </section>
  );
}
