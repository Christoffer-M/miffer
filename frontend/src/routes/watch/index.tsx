import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, History } from "lucide-react";
import type { Watch } from "../../api";
import { Avatars } from "../../brand";
import { useOnline } from "../../offline";
import { useMembers } from "../../queries/household";
import { watchQuery } from "../../queries/watch";
import { animatedBlock, animatedItem } from "../../viewTransition";
import { type Kind, KINDS, PosterTile, tileLabel } from "../../watch";
import ui from "../../ui.module.css";
import g from "../groceries.module.css";
import { Pick, useToWatch } from "./-toWatch";
import s from "./watch.module.css";

export const Route = createFileRoute("/watch/")({ component: WatchList });

/** Movies on one shelf and series on another, each scrolling sideways. */
function WatchList() {
  const { data: list = [], isPending, error } = useQuery(watchQuery);
  const online = useOnline();
  const { open, sheet, bottom } = useToWatch();

  const toWatch = list.filter((w) => !w.watchedAt);
  const watchedCount = list.length - toWatch.length;

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
            <Link to="/watch/watched" className={s.action} aria-label={`Watched, ${watchedCount}`}>
              <History size={20} aria-hidden />
              {watchedCount}
            </Link>
            <Avatars />
          </div>
        </div>
      </header>

      <main className={s.shelves}>
        {error && <p className={`${ui.error} ${s.shelfNote}`}>{error.message}</p>}
        {!isPending && toWatch.length === 0 ? (
          <p className={`${ui.muted} ${s.shelfNote}`}>Nothing to watch yet. Tap + to add a movie or series.</p>
        ) : (
          (["movie", "series"] as const).map((kind) => (
            <Shelf key={kind} kind={kind} list={toWatch.filter((w) => w.kind === kind)} onOpen={open} />
          ))
        )}
      </main>

      {sheet}
      {bottom}
    </>
  );
}

function Shelf({ kind, list, onOpen }: { kind: Kind; list: Watch[]; onOpen: (w: Watch) => void }) {
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
            <Pick list={list} kind={kind} />
            <Link to={page} className={s.seeAll} aria-label={`See all ${name}`}>
              See all
              <ChevronRight size={18} aria-hidden />
            </Link>
          </div>
        )}
      </div>
      {list.length === 0 ? (
        <p className={`${ui.muted} ${s.shelfNote}`}>No {name} to watch. Tap + to add one.</p>
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
