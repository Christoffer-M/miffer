import { type ReactNode, useState } from "react";
import { Button as AriaButton, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Film, Tv } from "lucide-react";
import type { Watch } from "./api";
import { Avatar } from "./brand";
import { useMembers } from "./queries/household";
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

type Size = "small" | "large" | "fill";
const SIZES = { small: s.poster, large: `${s.poster} ${s.posterLarge}`, fill: `${s.poster} ${s.posterFill}` };

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
        <Icon size={size === "small" ? 20 : 36} aria-hidden />
      </span>
    );
  }
  // About three times the shown width, for sharp phone screens.
  const src = `https://image.tmdb.org/t/p/${size === "small" ? "w154" : "w342"}${path}`;
  return <img className={SIZES[size]} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

/** One poster on the wall, with the initial of whoever added it. Tapping opens its sheet. */
export function PosterTile({ item, label, onPress }: { item: Watch; label: string; onPress: () => void }) {
  const { members } = useMembers();
  const adder = members.findIndex((m) => m.id === item.addedBy);
  return (
    <AriaButton className={s.tile} onPress={onPress} aria-label={label}>
      <Poster path={item.posterPath} kind={item.kind} size="fill" />
      {adder >= 0 && (
        <span className={s.badge}>
          <Avatar name={members[adder].name} index={adder} small />
        </span>
      )}
      <span className={s.caption} aria-hidden>
        {item.title}
      </span>
    </AriaButton>
  );
}

type SheetProps = {
  /** Kept while the sheet slides away, so it doesn't empty out as it goes. */
  item?: Watch;
  isOpen: boolean;
  onClose: () => void;
  /** Above the title, e.g. "Tonight". */
  eyebrow?: string;
  /** The line under the meta, e.g. "Mia added it". */
  note: string;
  /** Two buttons, or three with the first (the main one) across the whole width. */
  actions: ReactNode;
  /** Between the title and the buttons, e.g. where a series is up to. */
  children?: ReactNode;
};

/** A poster big, with what's known about it and two things to do. Slides up from the bottom. */
export function WatchSheet({ item, isOpen, onClose, eyebrow, note, actions, children }: SheetProps) {
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable className={sheet.overlay}>
      <Modal className={sheet.sheet}>
        <Dialog className={sheet.dialog}>
          {item && (
            <>
              <div className={s.pick}>
                <Poster path={item.posterPath} kind={item.kind} size="large" />
                <div className={s.pickText}>
                  {eyebrow && <span className={ui.eyebrow}>{eyebrow}</span>}
                  <Heading slot="title" className={s.pickTitle}>
                    {item.title}
                  </Heading>
                  <WatchMeta kind={item.kind} year={item.year} />
                  <span className={`${ui.muted} ${ui.small}`}>{note}</span>
                </div>
              </div>
              {children}
              <div className={`${sheet.actions} ${s.sheetActions}`}>{actions}</div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/** Whether a list of posters is on screen: changes there animate. Not on Add, which leaves the list alone. */
export const showsList = () =>
  ["/watch", "/watch/movies", "/watch/series", "/watch/watching", "/watch/watched"].includes(location.pathname);

/**
 * A series someone has started and not finished: it's on Watching, not on the shelves.
 * Loose (!=) because a list kept on the phone from before progress existed has no season at all.
 */
export const isWatching = (w?: Watch) => !!w && !w.watchedAt && w.season != null && w.episode != null;

/** Still to start: what the shelves and See all show of a kind. */
export const toStart = (list: Watch[], kind?: Kind) =>
  list.filter((w) => !w.watchedAt && !isWatching(w) && (!kind || w.kind === kind));

/** "You added it", "Mia added it". */
export const addedIt = (who: string) => `${who.charAt(0).toUpperCase()}${who.slice(1)} added it`;

/** What a tile is called for screen readers: "Druk, movie, 2020, added by Mia". */
export const tileLabel = (w: Watch, note: string) =>
  [w.title, KINDS[w.kind].label.toLowerCase(), w.year, note].filter(Boolean).join(", ");
