import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button as AriaButton, Form } from "react-aria-components";
import { ChevronLeft, Plus, Undo2 } from "lucide-react";
import { type SearchResult, session, type Watch } from "../../api";
import { Button, buttonClass } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { type NewWatch, useAddWatch, useSetWatched } from "../../mutations/watch";
import { isOffline } from "../../offline";
import { searchQuery, watchQuery } from "../../queries/watch";
import { lower } from "../../suggest";
import { isWatching, KINDS, Poster, WatchMeta, WatchSheet } from "../../watch";
import ui from "../../ui.module.css";
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
  const tappedOn = tapped.result && findOn(list, tapped.result);

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
        <WatchSheet
          item={tapped.result}
          isOpen={tapped.isOpen}
          onClose={close}
          eyebrow={tappedOn?.watchedAt ? "Watched" : undefined}
          actions={
            <>
              <Button variant="outline" onPress={close}>
                Cancel
              </Button>
              <Button onPress={() => (close(), add(tapped.result!))} autoFocus>
                {tappedOn?.watchedAt ? <Undo2 size={18} aria-hidden /> : <Plus size={18} aria-hidden />}
                {tappedOn?.watchedAt ? "Watch again" : "Add"}
              </Button>
            </>
          }
        />
      )}
    </>
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
