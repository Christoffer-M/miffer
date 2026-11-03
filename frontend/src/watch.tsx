import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useId, useRef, useState } from "react";
import { Button as AriaButton, Dialog, DialogTrigger, Heading, Modal, ModalOverlay, Popover } from "react-aria-components";
import { ChevronLeft, ChevronRight, Film, Star, Tv } from "lucide-react";
import type { Watch } from "./api";
import { caughtUp, count, type Place, settle } from "./progress";
import { Avatar } from "./brand";
import { SheetGrabber } from "./components/SheetGrabber";
import { useMembers } from "./queries/household";
import { detailsQuery } from "./queries/watch";
import ui from "./ui.module.css";
import sheet from "./components/Confirm.module.css";
import s from "./routes/watch/watch.module.css";

export type Kind = Watch["kind"];

export const KINDS = {
  movie: { label: "Movie", plural: "Movies", page: "/watch/movies", Icon: Film },
  series: { label: "Series", plural: "Series", page: "/watch/series", Icon: Tv },
} as const;

/** The small line under a title: "Movie · 2024 · Anna". */
export function WatchMeta({ kind, year, extra }: { kind: Watch["kind"]; year: number | null; extra?: string }) {
  const { label, Icon } = KINDS[kind];
  return (
    <span className={s.meta}>
      <Icon size={14} aria-hidden />
      {[label, year, extra].filter(Boolean).join(" · ")}
    </span>
  );
}

type Size = "tiny" | "small" | "medium" | "large" | "fill";
const SIZES = {
  tiny: `${s.poster} ${s.posterTiny}`,
  small: s.poster,
  medium: `${s.poster} ${s.posterMedium}`,
  large: `${s.poster} ${s.posterLarge}`,
  fill: `${s.poster} ${s.posterFill}`,
};
const ICON_SIZES = { tiny: 16, small: 20, medium: 28, large: 36, fill: 36 };

/**
 * The poster from TMDB's image server, or the movie or series icon when there's none: typed by
 * hand, or it won't load (offline: posters aren't kept on the phone).
 */
export function Poster({ path, kind, size = "small" }: { path: string | null; kind: Watch["kind"]; size?: Size }) {
  const [failed, setFailed] = useState(false);
  if (!path || failed) {
    const { Icon } = KINDS[kind];
    return (
      <span className={SIZES[size]}>
        <Icon size={ICON_SIZES[size]} aria-hidden />
      </span>
    );
  }
  // About three times the shown width, for sharp phone screens.
  const src = `https://image.tmdb.org/t/p/${size === "large" || size === "fill" ? "w342" : "w154"}${path}`;
  return <img className={SIZES[size]} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

/** One poster on the wall, with the initial of whoever added it. Tapping opens its sheet. */
type TileProps = {
  item: Watch;
  label: string;
  onPress: () => void;
  /** A small line under the title, e.g. "3 seasons". */
  sub?: string;
  /** Under the title, e.g. "New season". */
  tag?: string;
  /** On the poster, which gets a ring: "New season" on Watch's Series shelf. */
  flag?: string;
};

export function PosterTile({ item, label, onPress, sub, tag, flag }: TileProps) {
  const { members } = useMembers();
  const adder = members.findIndex((m) => m.id === item.addedBy);
  return (
    <AriaButton className={s.tile} onPress={onPress} aria-label={label}>
      {flag ? (
        <span className={s.flagged}>
          <Poster path={item.posterPath} kind={item.kind} size="fill" />
          <span className={s.flag} aria-hidden>
            <Tv size={11} strokeWidth={2.5} />
            {flag}
          </span>
        </span>
      ) : (
        <Poster path={item.posterPath} kind={item.kind} size="fill" />
      )}
      {adder >= 0 && (
        <span className={s.badge}>
          <Avatar name={members[adder].name} index={adder} small />
        </span>
      )}
      <span className={s.caption} aria-hidden>
        {item.title}
      </span>
      {sub && (
        <span className={s.sub} aria-hidden>
          {sub}
        </span>
      )}
      {tag && (
        <span className={s.tag} aria-hidden>
          {tag}
        </span>
      )}
    </AriaButton>
  );
}

/** A movie or series on the list, or a search result, which brings its plot and rating along. */
type SheetItem = Pick<Watch, "title" | "kind" | "year" | "posterPath" | "tmdbId"> & {
  addedBy?: string | null;
  overview?: string | null;
  rating?: number | null;
};

type SheetProps = {
  /** Kept while the sheet slides away, so it doesn't empty out as it goes. */
  item?: SheetItem;
  isOpen: boolean;
  onClose: () => void;
  /** Above the title, e.g. "Tonight". */
  eyebrow?: string;
  /** A line under the genres, e.g. "Watched 3 Nov". Who added it is a badge on the picture. */
  note?: string;
  /** Two buttons, or three with the first (the main one) across the whole width. */
  actions: ReactNode;
  /** Under the title, e.g. where a series is up to. */
  children?: ReactNode;
};

/**
 * A movie or series big, the same wherever it's tapped: stills, rating, genres, plot and cast from
 * TMDB, and what can be done with it. Tall: its middle scrolls, the buttons stay put. Slides up from the bottom.
 */
export function WatchSheet({ item, isOpen, onClose, eyebrow, note, actions, children }: SheetProps) {
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable className={sheet.overlay}>
      <Modal className={`${sheet.sheet} ${s.infoSheet}`}>
        <SheetGrabber />
        <Dialog className={`${sheet.dialog} ${s.info}`}>
          {item && (
            <>
              <div className={s.infoBody}>
                {/* Afresh for another one (Tonight's Another), so the stills start at the first. */}
                <About key={`${item.kind}-${item.tmdbId ?? item.title}`} item={item} eyebrow={eyebrow} note={note}>
                  {children}
                </About>
              </div>
              <div className={`${sheet.actions} ${s.sheetActions}`}>{actions}</div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

const languages = new Intl.DisplayNames(["en"], { type: "language" });
const runtime = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`);

/**
 * A sheet's middle. A search result's plot and rating show at once; the rest arrives from TMDB.
 * Without stills (typed by hand, or TMDB has none) the poster goes beside the title instead.
 */
function About({ item, eyebrow, note, children }: { item: SheetItem; eyebrow?: string; note?: string; children?: ReactNode }) {
  const { members, whoIs } = useMembers();
  const castId = useId();
  const details = useQuery(detailsQuery(item));
  const d = details.data;
  const overview = item.overview ?? d?.overview;
  const rating = item.rating ?? d?.rating;
  const length = d?.runtime ? runtime(d.runtime) : d?.seasons ? count(d.seasons, "season") : undefined;
  const language = d?.language && d.language !== "en" ? languages.of(d.language) : undefined; // English goes without saying
  const stills = d?.stills ?? [];
  // Who added it, in the picture's corner as on the poster wall; a tap says it in words.
  const adder = members.findIndex((m) => m.id === item.addedBy);
  const added = adder >= 0 && addedThis(whoIs(item.addedBy!));
  const badge = added && (
    <DialogTrigger>
      <AriaButton className={`${s.badge} ${s.badgeButton}`} aria-label={added}>
        <Avatar name={members[adder].name} index={adder} />
      </AriaButton>
      <Popover placement="bottom end" offset={2} className={s.addedBy}>
        <Dialog aria-label={added} className={s.addedByText}>
          {added}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );

  const text = (
    <div className={s.pickText}>
      {eyebrow && <span className={ui.eyebrow}>{eyebrow}</span>}
      <Heading slot="title" className={s.pickTitle}>
        {item.title}
      </Heading>
      <div className={s.infoLine}>
        <WatchMeta kind={item.kind} year={item.year} extra={length} />
        {rating != null && (
          <span className={s.rating}>
            <Star size={14} aria-hidden fill="currentColor" />
            {rating.toFixed(1)}
            <span>/ 10</span>
          </span>
        )}
      </div>
      {(d?.genres.length || language) && (
        <div className={s.genres}>
          {d?.genres.map((g) => (
            <span key={g} className={s.genre}>
              {g}
            </span>
          ))}
          {language && <span className={`${s.genre} ${s.genreNeutral}`}>{language}</span>}
        </div>
      )}
      {note && <span className={`${ui.muted} ${ui.small}`}>{note}</span>}
    </div>
  );

  return (
    <>
      {/* The tint holds the stills' place while they load. */}
      {details.isLoading || stills.length ? (
        <>
          {stills.length ? (
            <Stills paths={stills} badge={badge} />
          ) : (
            <div className={s.stillsFrame}>
              <div className={s.stillsStrip} />
              {badge}
            </div>
          )}
          {text}
        </>
      ) : (
        <div className={s.pick}>
          <span className={s.stillsFrame}>
            <Poster path={item.posterPath} kind={item.kind} size="large" />
            {badge}
          </span>
          {text}
        </div>
      )}
      {children}
      {overview && <p className={s.overview}>{overview}</p>}
      {d?.cast.length ? (
        <div className={s.pickText}>
          <span id={castId} className={ui.eyebrow}>
            Cast
          </span>
          <ul className={s.cast} aria-labelledby={castId}>
            {d.cast.map((p, i) => (
              <li key={i}>
                {p.profilePath ? (
                  <img className={s.face} src={`https://image.tmdb.org/t/p/w185${p.profilePath}`} alt="" loading="lazy" />
                ) : (
                  <span className={s.face} aria-hidden>
                    {p.name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                )}
                <span className={s.castName}>{p.name}</span>
                {p.character && <span className={s.castRole}>{p.character}</span>}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

/** Stills side by side: swipe them (native scroll snapping) or use the arrows; the dots show where you are. */
function Stills({ paths, badge }: { paths: string[]; badge: ReactNode }) {
  const strip = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const n = paths.length;
  const go = (i: number) => {
    const el = strip.current!;
    el.scrollTo({ left: ((i + n) % n) * el.clientWidth, behavior: "smooth" });
  };
  return (
    <div className={s.stills} role="group" aria-roledescription="carousel" aria-label="Stills">
      <div className={s.stillsFrame}>
        <div
          ref={strip}
          className={s.stillsStrip}
          onScroll={(e) => setAt(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        >
          {paths.map((p, i) => (
            // The one after this one loads ahead, so it's there when swiped to.
            <img key={p} src={`https://image.tmdb.org/t/p/w780${p}`} alt="" loading={i <= at + 1 ? "eager" : "lazy"} />
          ))}
        </div>
        {n > 1 && (
          <>
            <AriaButton className={`${s.stillsArrow} ${s.prev}`} aria-label="Previous still" onPress={() => go(at - 1)}>
              <ChevronLeft size={20} aria-hidden />
            </AriaButton>
            <AriaButton className={`${s.stillsArrow} ${s.next}`} aria-label="Next still" onPress={() => go(at + 1)}>
              <ChevronRight size={20} aria-hidden />
            </AriaButton>
          </>
        )}
        {badge}
      </div>
      {n > 1 && (
        <div className={s.dots} aria-hidden>
          {paths.map((p, i) => (
            <span key={p} className={s.stillDot} data-current={i === at || undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Whether a list of posters is on screen: changes there animate. Not on Add, which leaves the list alone. */
export const showsList = () =>
  ["/watch", "/watch/movies", "/watch/series", "/watch/watched"].includes(location.pathname);

/**
 * A series someone has started and not finished: it's on Watching, not on the shelves.
 * Loose (!=) because a list kept on the phone from before progress existed has no season at all.
 */
export const isWatching = (w?: Watch) => !!w && !w.watchedAt && w.season != null && w.episode != null;

/** Watched last first: Watching's order. A series started before progressAt existed goes by when it was added. */
export const byRecent = (a: Watch, b: Watch) =>
  (b.progressAt ?? b.createdAt).localeCompare(a.progressAt ?? a.createdAt);

/** Where a series is up to, as a real episode once its seasons are known (progress.ts). */
export const placeOf = (w: Watch, seasons?: number[]): Place => settle({ season: w.season ?? 1, episode: w.episode ?? 1 }, seasons);

/** A series' seasons from TMDB, when this phone has them. */
export type SeasonsOf = (w: Watch) => number[] | undefined;

/**
 * Watching's layout: the series watched last that isn't caught up goes on top, the rest of those
 * under it, and the caught-up ones at the bottom.
 */
export function watchingGroups(list: Watch[], seasonsOf: SeasonsOf) {
  const shown = list.filter(isWatching).sort(byRecent);
  const isCaught = (w: Watch) => caughtUp(placeOf(w, seasonsOf(w)), seasonsOf(w));
  const [hero, ...others] = shown.filter((w) => !isCaught(w));
  return { hero, others, caught: shown.filter(isCaught) };
}

/** The same as one string, to tell whether a change moves anything on Watching. */
export function watchingLayout(list: Watch[], seasonsOf: SeasonsOf) {
  const { hero, others, caught } = watchingGroups(list, seasonsOf);
  return JSON.stringify([hero?.id, others.map((w) => w.id), caught.map((w) => w.id)]);
}

/** Still to start: what the shelves and See all show of a kind. */
export const toStart = (list: Watch[], kind?: Kind) =>
  list.filter((w) => !w.watchedAt && !isWatching(w) && (!kind || w.kind === kind));

/** "You added this", "Mia added this". */
export const addedThis = (who: string) => `${who.charAt(0).toUpperCase()}${who.slice(1)} added this`;

/** What a tile is called for screen readers: "Druk, movie, 2020, added by Mia". */
export const tileLabel = (w: Watch, note: string) =>
  [w.title, KINDS[w.kind].label.toLowerCase(), w.year, note].filter(Boolean).join(", ");
