import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ChevronRight, History } from "lucide-react";
import type { Watch } from "../../api";
import { Avatars } from "../../brand";
import { useOnline } from "../../offline";
import { useMembers } from "../../queries/household";
import { useWatchedSeries, watchQuery } from "../../queries/watch";
import { animatedBlock, animatedItem } from "../../viewTransition";
import { type Kind, KINDS, placeOf, Poster, PosterTile, tileLabel, toStart } from "../../watch";
import ui from "../../ui.module.css";
import g from "../groceries.module.css";
import { Pick, useToWatch } from "./-toWatch";
import { short, useWatching } from "./-watching";
import s from "./watch.module.css";

export const Route = createFileRoute("/watch/")({ component: WatchList });

/**
 * Movies on one shelf and series on another, each scrolling sideways. Started series aren't on
 * the shelf: a card at the top of it leads to them, on Series' Watching tab.
 */
function WatchList() {
  const { data: list = [], isPending, error } = useQuery(watchQuery);
  const online = useOnline();
  const { open, start, sheet, bottom } = useToWatch();

  const toWatch = toStart(list);
  const watching = useWatching(list);
  const watchedCount = list.filter((w) => w.watchedAt).length;
  // Watched series with a new season since: a dot on Watched says so.
  const freshCount = useWatchedSeries(list).fresh.size;

  return (
    <>
      <header className={`${g.header} ${s.shelvesHeader}`} data-vt="list-header">
        <div className={ui.row}>
          <span className={ui.eyebrow}>miffer</span>
          <span className={`${g.badge} ${online ? g.synced : g.offline}`}>{online ? "Synced" : "Offline"}</span>
        </div>
        <div className={`${ui.row} ${g.titleRow}`}>
          <h1 className={ui.display}>Watch</h1>
          <div className={s.actions}>
            <Link
              to="/watch/watched"
              // New episodes are on the Series side: open there.
              search={freshCount ? { kind: "series" } : {}}
              className={s.action}
              aria-label={`Watched, ${watchedCount}${freshCount ? `, ${freshCount} with new episodes` : ""}`}
            >
              <span className={s.iconWithDot}>
                <History size={20} aria-hidden />
                {freshCount > 0 && <span className={s.dot} />}
              </span>
              {watchedCount}
            </Link>
            <Avatars />
          </div>
        </div>
      </header>

      <main className={s.shelves}>
        {error && <p className={`${ui.error} ${s.shelfNote}`}>{error.message}</p>}
        {!isPending && toWatch.length === 0 && watching.shown.length === 0 ? (
          <p className={`${ui.muted} ${s.shelfNote}`}>Nothing to watch yet. Tap + to add a movie or series.</p>
        ) : (
          (["movie", "series"] as const).map((kind) => (
            <Shelf key={kind} kind={kind} list={toWatch.filter((w) => w.kind === kind)} onOpen={open} onStart={start}>
              {kind === "series" && <WatchingCard {...watching} />}
            </Shelf>
          ))
        )}
      </main>

      {sheet}
      {bottom}
    </>
  );
}

type ShelfProps = {
  kind: Kind;
  list: Watch[];
  onOpen: (w: Watch) => void;
  onStart: (w: Watch) => void;
  /** Between the shelf's title and its posters: on Series, the card for the ones being watched. */
  children?: ReactNode;
};

function Shelf({ kind, list, onOpen, onStart, children }: ShelfProps) {
  const { whoIs } = useMembers();
  const { plural, page, Icon } = KINDS[kind];
  const name = plural.toLowerCase();

  return (
    <section className={s.shelf} aria-labelledby={`shelf-${kind}`} {...animatedBlock(`shelf-${kind}`)}>
      <div className={s.shelfHead}>
        <h2 id={`shelf-${kind}`} className={s.shelfTitle}>
          <Icon size={20} aria-hidden />
          {plural}
          <span className={s.shelfCount}>{list.length}</span>
        </h2>
        {list.length > 0 && (
          <div className={s.actions}>
            <Pick list={list} kind={kind} onStart={onStart} />
            {/* Series' See all is its To start tab. */}
            <Link to={page} search={kind === "series" ? { tab: "start" } : {}} className={s.seeAll} aria-label={`See all ${name}`}>
              See all
              <ChevronRight size={18} aria-hidden />
            </Link>
          </div>
        )}
      </div>
      {children}
      {list.length === 0 ? (
        <p className={`${ui.muted} ${s.shelfNote}`}>No {name} to {kind === "series" ? "start" : "watch"}. Tap + to add one.</p>
      ) : (
        <ul className={s.row} aria-label={`${plural} to watch`}>
          {list.map((w) => (
            <li key={w.id} {...animatedItem(`watch-${w.id}`)}>
              <PosterTile item={w} label={tileLabel(w, `added by ${whoIs(w.addedBy)}`)} onPress={() => onOpen(w)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type WatchingCardProps = ReturnType<typeof useWatching>;

/**
 * The series being watched, in one card at the top of the Series shelf: how many, and the one
 * to go on with. It opens Series on Watching.
 */
function WatchingCard({ shown, hero, others, caught, seasonsOf }: WatchingCardProps) {
  if (!shown.length) return null;
  const at = hero && placeOf(hero, seasonsOf(hero));
  const posters = [hero, ...others, ...caught].filter((w) => !!w).slice(0, 3);
  return (
    <Link
      to="/watch/series"
      search={{ tab: "watching" }}
      className={s.watchingCard}
      aria-label={`Watching ${shown.length} series. ${hero && at ? `Next up: ${hero.title}, season ${at.season}, episode ${at.episode}` : "All caught up"}`}
      {...animatedBlock("watching-card")}
    >
      <span className={s.stack} aria-hidden>
        {posters.map((w) => (
          <Poster key={w.id} path={w.posterPath} kind={w.kind} size="tiny" />
        ))}
      </span>
      <span className={s.text}>
        <span className={ui.eyebrow}>Watching · {shown.length}</span>
        {hero && at ? (
          <span className={s.compactTitle}>
            Continue {hero.title} <span className={s.compactPlace}>{short(at)}</span>
          </span>
        ) : (
          <span className={s.compactTitle}>All caught up</span>
        )}
      </span>
      <ChevronRight size={20} aria-hidden />
    </Link>
  );
}
