import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button as AriaButton, Dialog, Form, Heading, Modal, ModalOverlay } from "react-aria-components";
import { ChevronLeft, ChevronRight, Plus, Star, Undo2 } from "lucide-react";
import { type SearchResult, session, type Watch } from "../../api";
import { Button, buttonClass } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { type NewWatch, useAddWatch, useSetWatched } from "../../mutations/watch";
import { isOffline } from "../../offline";
import { detailsQuery, searchQuery, watchQuery } from "../../queries/watch";
import { lower } from "../../suggest";
import { isWatching, KINDS, Poster, WatchMeta } from "../../watch";
import ui from "../../ui.module.css";
import sheet from "../../components/Confirm.module.css";
import g from "../groceries.module.css";
import s from "./watch.module.css";

export const Route = createFileRoute("/watch/add")({ component: Add });

/** The same movie or series already on the list (or watched), if it is. */
function findOn(list: Watch[], w: NewWatch) {
  return list.find((x) =>
    w.tmdbId ? x.tmdbId === w.tmdbId && x.kind === w.kind : !x.tmdbId && x.kind === w.kind && lower(x.title) === lower(w.title),
  );
}

/** What was typed, a moment after typing stops, so TMDB isn't asked on every letter. */
function useSettled(text: string) {
  const [settled, setSettled] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(text), 300);
    return () => clearTimeout(timer);
  }, [text]);
  return settled;
}

/** Search TMDB and add from there, or add what was typed. Then back to Watch, to see it arrive. */
function Add() {
  const { data: list = [] } = useQuery(watchQuery);
  const addWatch = useAddWatch();
  const setWatched = useSetWatched();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  // The result tapped last, to see what it is before adding; kept after closing so the sheet doesn't empty as it slides away.
  const [tapped, setTapped] = useState<{ result?: SearchResult; isOpen: boolean }>({ isOpen: false });
  const close = () => setTapped((t) => ({ ...t, isOpen: false }));

  const typed = draft.trim();
  const q = useSettled(typed);
  const search = useQuery(searchQuery(q));
  const results = q === typed ? (search.data ?? []) : [];
  const searching = typed.length >= 2 && (q !== typed || search.isFetching);

  /** Adds it, unless it's there already: then a watched one comes back on the list (from the start), or it's left be. */
  async function add(w: NewWatch) {
    const existing = findOn(list, w);
    const change = () => {
      if (!existing) addWatch.mutate({ id: crypto.randomUUID(), ...w, addedBy: session.deviceId });
      else if (existing.watchedAt) setWatched.mutate({ id: existing.id, watched: false, place: null });
    };
    // Refused offline, and said so: this page stays, with what was typed, to try again.
    if (isOffline()) return change();
    // Back on Watch first, so the poster is seen dropping in: once the screen has slid in,
    // or its animation would cut the slide short.
    await navigate({ to: "/watch" });
    await document.activeViewTransition?.finished.catch(() => {});
    change();
  }

  // Enter adds the top result.
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const top = results.find((r) => {
      const on = findOn(list, r);
      return !on || on.watchedAt; // not one that's already on the list
    });
    if (top) add(top);
  }

  return (
    <>
      <header className={g.header} data-vt="list-header">
        <Link to="/watch" className={`${buttonClass("text")} ${s.back}`}>
          <ChevronLeft size={18} aria-hidden />
          Watch
        </Link>
        <h1 className={ui.display}>Add</h1>
        <Form onSubmit={submit} className={g.keepWithKeyboard}>
          <TextField
            label="Movie or series"
            hideLabel
            placeholder="Search for a movie or series"
            value={draft}
            onChange={setDraft}
            maxLength={100}
            autoFocus
            inputProps={{ className: g.addInput, enterKeyHint: "search", autoComplete: "off" }}
          />
        </Form>
      </header>

      <main className={`${ui.content} ${g.list}`}>
        {typed.length >= 2 && (
          <div className={s.resultList} aria-label="Search results" role="group" aria-busy={searching}>
            {results.map((r) => (
              <Result key={`${r.kind}-${r.tmdbId}`} result={r} on={findOn(list, r)} onPress={() => setTapped({ result: r, isOpen: true })} />
            ))}
            {searching && results.length === 0 && <span className={`${ui.muted} ${s.searchNote}`}>Searching…</span>}
            {!searching && search.error && <span className={`${ui.muted} ${s.searchNote}`}>{search.error.message}</span>}
            <div className={s.byHand}>
              <span className={ui.muted}>
                {results.length ? "Not there? Add" : "Add"} “{typed}” as
              </span>
              <div className={s.byHandButtons}>
                {(["movie", "series"] as const).map((kind) => {
                  const { label, Icon } = KINDS[kind];
                  return (
                    <AriaButton
                      key={kind}
                      className={s.kindButton}
                      preventFocusOnPress
                      onPress={() => add({ title: typed, kind, tmdbId: null, year: null, posterPath: null })}
                    >
                      <Icon size={18} aria-hidden />
                      {label}
                    </AriaButton>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {tapped.result && (
        <InfoSheet
          result={tapped.result}
          on={findOn(list, tapped.result)}
          isOpen={tapped.isOpen}
          onClose={close}
          onAdd={() => (close(), add(tapped.result!))}
        />
      )}
    </>
  );
}

const languages = new Intl.DisplayNames(["en"], { type: "language" });
const runtime = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`);

type InfoProps = { result: SearchResult; on?: Watch; isOpen: boolean; onClose: () => void; onAdd: () => void };

/** A search result big, before adding it: stills, rating, genres, what it's about and who's in it, from TMDB. */
function InfoSheet({ result: r, on, isOpen, onClose, onAdd }: InfoProps) {
  // Search brings the title, rating and plot, so those show at once; this fills in the rest.
  const details = useQuery(detailsQuery(r));
  const d = details.data;
  const length = d?.runtime ? runtime(d.runtime) : d?.seasons ? `${d.seasons} season${d.seasons === 1 ? "" : "s"}` : undefined;
  const language = d?.language && d.language !== "en" ? languages.of(d.language) : undefined; // English goes without saying
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable className={sheet.overlay}>
      <Modal className={`${sheet.sheet} ${s.infoSheet}`}>
        <Dialog className={`${sheet.dialog} ${s.info}`}>
          <div className={s.infoBody}>
            {details.isPending ? <div className={s.stillsStrip} /> : d?.stills.length ? <Stills paths={d.stills} /> : null}
            <div className={s.pickText}>
              {on?.watchedAt && <span className={ui.eyebrow}>Watched</span>}
              <Heading slot="title" className={s.pickTitle}>
                {r.title}
              </Heading>
              <div className={s.infoLine}>
                <WatchMeta kind={r.kind} year={r.year} extra={length} />
                {r.rating && (
                  <span className={s.rating}>
                    <Star size={14} aria-hidden fill="currentColor" />
                    {r.rating.toFixed(1)}
                    <span className={ui.muted}>/ 10</span>
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
            </div>
            <p className={s.overview}>{r.overview ?? "No description on TMDB."}</p>
            {d?.cast.length ? (
              <div className={s.pickText}>
                <span id="cast" className={ui.eyebrow}>
                  Cast
                </span>
                <ul className={s.cast} aria-labelledby="cast">
                  {d.cast.map((p, i) => (
                    <li key={i}>
                      {p.profilePath ? (
                        <img className={s.face} src={`https://image.tmdb.org/t/p/w185${p.profilePath}`} alt="" loading="lazy" />
                      ) : (
                        <span className={s.face} aria-hidden>
                          {p.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                        </span>
                      )}
                      <span className={s.castName}>{p.name}</span>
                      {p.character && <span className={s.castRole}>{p.character}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <div className={sheet.actions}>
            <Button variant="outline" onPress={onClose}>
              Cancel
            </Button>
            <Button onPress={onAdd} autoFocus>
              {on?.watchedAt ? <Undo2 size={18} aria-hidden /> : <Plus size={18} aria-hidden />}
              {on?.watchedAt ? "Watch again" : "Add"}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/** Stills side by side: swipe them (native scroll snapping), or the arrows and dots scroll to one. */
function Stills({ paths }: { paths: string[] }) {
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
          {paths.map((p) => (
            <img key={p} src={`https://image.tmdb.org/t/p/w780${p}`} alt="" loading="lazy" />
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
      </div>
      {n > 1 && (
        <div className={s.dots}>
          {paths.map((p, i) => (
            <AriaButton key={p} className={s.stillDot} aria-label={`Still ${i + 1}`} aria-current={i === at || undefined} onPress={() => go(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One search result: tap to see what it is, and add it from there (or put it back from Watched). */
function Result({ result: r, on, onPress }: { result: SearchResult; on?: Watch; onPress: () => void }) {
  const label = (
    <>
      <Poster path={r.posterPath} kind={r.kind} />
      <span className={s.text}>
        <strong>{r.title}</strong>
        <WatchMeta kind={r.kind} year={r.year} />
      </span>
    </>
  );
  if (on && !on.watchedAt) {
    return (
      <span className={`${s.result} ${s.onList}`}>
        {label}
        <span className={s.status}>{isWatching(on) ? "Watching" : "On the list"}</span>
      </span>
    );
  }
  return (
    // Keeps focus (and the phone keyboard) on the field, for the next search.
    <AriaButton className={s.result} preventFocusOnPress onPress={onPress}>
      {label}
      {on ? (
        <span className={s.status}>
          <Undo2 size={14} aria-hidden /> Watched
        </span>
      ) : null}
    </AriaButton>
  );
}
