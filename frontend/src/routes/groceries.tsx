import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type CSSProperties, useState, useSyncExternalStore } from "react";
import { Button as AriaButton, Form } from "react-aria-components";
import { Check, Plus, Trash2, Undo2, X } from "lucide-react";
import { session } from "../api";
import { Avatars } from "../brand";
import { Button } from "../components/Button";
import { Checkbox } from "../components/Checkbox";
import { SwipeRow } from "../components/SwipeRow";
import { TextField } from "../components/TextField";
import { useAddItem, useClearDone, useRemoveItem, useSetDone } from "../mutations/items";
import { useMembers } from "../queries/household";
import { historyQuery, itemsQuery } from "../queries/items";
import { starterItems } from "../groceries.da";
import { lower, suggest } from "../suggest";
import ui from "../ui.module.css";
import s from "./groceries.module.css";

export const Route = createFileRoute("/groceries")({ component: Groceries });

function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
  );
}

/**
 * Lets an item animate in list changes (see viewTransition.ts). An item has a different
 * name in the list than in the cart, so ticking it slides it out of one list and drops
 * it into the other, instead of gliding between them.
 */
const animated = (id: string, list: "todo" | "cart") => ({
  "data-vt-item": id,
  style: { "--vt-name": `${list}-${id}` } as CSSProperties,
});

function Groceries() {
  const { data: items = [], isPending, error } = useQuery(itemsQuery);
  const online = useOnline();
  const { whoIs } = useMembers();
  const addItem = useAddItem();
  const setDone = useSetDone();
  const removeItem = useRemoveItem();
  const clearDone = useClearDone();
  const { data: history = [] } = useQuery(historyQuery);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);

  const todo = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const typed = draft.trim();
  const suggestions = suggest(draft, history, starterItems, items, 8);

  /** Adds a name, unless it's already there: then it's put back from the cart, or left be. */
  function addName(name: string) {
    const existing = items.find((i) => lower(i.name) === lower(name));
    if (!existing) addItem.mutate({ id: crypto.randomUUID(), name, addedBy: session.deviceId });
    else if (existing.done) setDone.mutate({ id: existing.id, done: false });
    setDraft("");
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (typed) addName(typed);
  }

  return (
    <>
      <header className={s.header} data-vt="list-header">
        <div className={ui.row}>
          <span className={ui.eyebrow}>miffer</span>
          <span className={`${s.badge} ${online ? s.synced : s.offline}`}>{online ? "Synced" : "Offline"}</span>
        </div>
        <div className={`${ui.row} ${s.titleRow}`}>
          <h1 className={ui.display}>Groceries</h1>
          <Avatars />
        </div>
        <p className={ui.muted}>
          {todo.length} to get · {done.length} in the cart
        </p>
      </header>

      {!online && (
        <div className={s.notice}>
          <strong>You're offline</strong>
          <span>Changes will sync when you reconnect.</span>
        </div>
      )}

      <main className={`${ui.content} ${s.list}`}>
        {error && <p className={ui.error}>{error.message}</p>}
        {!isPending && items.length === 0 && <p className={`${ui.muted} ${s.empty}`}>Nothing on the list yet.</p>}

        {todo.length > 0 && (
          <ul className={s.sheet} aria-label="To get" data-vt="todo-sheet">
            {todo.map((item) => (
              <li key={item.id} className={s.item} {...animated(item.id, "todo")}>
                <SwipeRow
                  className={s.itemContent}
                  right={{ label: "Got it", icon: <Check size={20} aria-hidden />, onSwipe: () => setDone.mutate({ id: item.id, done: true }) }}
                  left={{ label: "Delete", icon: <Trash2 size={20} aria-hidden />, onSwipe: () => removeItem.mutate(item.id) }}
                >
                  <Checkbox
                    className={s.check}
                    isSelected={false}
                    onChange={() => setDone.mutate({ id: item.id, done: true })}
                  >
                    {item.name}
                  </Checkbox>
                  <span className={`${ui.muted} ${ui.small}`}>{whoIs(item.addedBy)}</span>
                  <Button variant="icon" aria-label={`Remove ${item.name}`} onPress={() => removeItem.mutate(item.id)}>
                    <X size={18} aria-hidden />
                  </Button>
                </SwipeRow>
              </li>
            ))}
          </ul>
        )}

        {done.length > 0 && (
          <section aria-labelledby="in-cart">
            <div className={`${ui.row} ${s.sectionHead}`} data-vt="cart-head">
              <h2 id="in-cart" className={`${ui.eyebrow} ${ui.muted} ${s.sectionTitle}`}>
                In the cart
              </h2>
              <Button variant="text" onPress={() => clearDone.mutate()}>
                Clear
              </Button>
            </div>
            <ul className={s.doneList}>
              {done.map((item) => (
                <li key={item.id} {...animated(item.id, "cart")}>
                  <SwipeRow
                    className={s.doneContent}
                    right={{ label: "Put back", icon: <Undo2 size={20} aria-hidden />, onSwipe: () => setDone.mutate({ id: item.id, done: false }) }}
                    left={{ label: "Delete", icon: <Trash2 size={20} aria-hidden />, onSwipe: () => removeItem.mutate(item.id) }}
                  >
                    <Checkbox
                      className={`${s.check} ${s.doneCheck}`}
                      isSelected
                      onChange={() => setDone.mutate({ id: item.id, done: false })}
                    >
                      <s>{item.name}</s>
                    </Checkbox>
                  </SwipeRow>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <Form className={s.addBar} onSubmit={add} data-vt="add-bar">
        {/* Suggestions show while focus is anywhere in here: the field, a suggestion or Add. */}
        <div
          className={s.focusArea}
          onFocus={() => setTyping(true)}
          onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setTyping(false)}
        >
          {/* A single row that scrolls sideways, in the bar rather than over the list, so the
              list stays in view (and shows what was just added) while the keyboard is open. */}
          {typing && (typed || suggestions.length > 0) && (
            <div className={s.strip} aria-label="Suggestions" role="group">
              {typed && suggestions.length === 0 && (
                <span className={`${ui.muted} ${ui.small} ${s.stripNote}`}>
                  {todo.some((i) => lower(i.name) === lower(typed))
                    ? "Already on the list."
                    : "New to your list: tap Add to put it on."}
                </span>
              )}
              {suggestions.map((sg) => {
                const end = typed ? sg.at + lower(typed).length : 0;
                const name = (
                  <span>
                    {sg.name.slice(0, sg.at)}
                    <b>{sg.name.slice(sg.at, end)}</b>
                    {sg.name.slice(end)}
                  </span>
                );
                return !sg.item ? (
                  <AriaButton key={sg.name} className={s.chip} preventFocusOnPress onPress={() => addName(sg.name)}>
                    <Plus size={16} aria-hidden className={s.chipIcon} />
                    {name}
                  </AriaButton>
                ) : (
                  <AriaButton
                    key={sg.name}
                    className={s.chip}
                    preventFocusOnPress
                    onPress={() => addName(sg.name)}
                    aria-label={`Put ${sg.name} back on the list`}
                  >
                    <Undo2 size={16} aria-hidden className={s.chipIcon} />
                    {name}
                    <span className={`${ui.muted} ${ui.small}`}>in cart</span>
                  </AriaButton>
                );
              })}
            </div>
          )}
          <TextField
            label="Add item"
            placeholder="e.g. havremælk"
            value={draft}
            onChange={setDraft}
            maxLength={200}
            className={s.addField}
            inputProps={{ className: s.addInput, enterKeyHint: "done", autoComplete: "off" }}
          />
          {/* Keeps focus (and the phone keyboard) on the field: otherwise the keyboard starts
              closing mid-tap, the layout jumps, and the tap no longer lands on the button. */}
          <Button type="submit" className={s.addButton} preventFocusOnPress>
            Add
          </Button>
        </div>
      </Form>
    </>
  );
}
