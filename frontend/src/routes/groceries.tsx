import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type CSSProperties, useState, useSyncExternalStore } from "react";
import { Form } from "react-aria-components";
import { X } from "lucide-react";
import { session } from "../api";
import { Avatars } from "../brand";
import { Button } from "../components/Button";
import { Checkbox } from "../components/Checkbox";
import { TextField } from "../components/TextField";
import { useAddItem, useClearDone, useRemoveItem, useSetDone } from "../mutations/items";
import { useMembers } from "../queries/household";
import { itemsQuery } from "../queries/items";
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

/** Lets an item animate between its old and new spot in list changes (see viewTransition.ts). */
const animated = (id: string) => ({
  "data-vt-item": id,
  style: { "--vt-name": `item-${id}` } as CSSProperties,
});

function Groceries() {
  const { data: items = [], isPending, error } = useQuery(itemsQuery);
  const online = useOnline();
  const { whoIs } = useMembers();
  const addItem = useAddItem();
  const setDone = useSetDone();
  const removeItem = useRemoveItem();
  const clearDone = useClearDone();
  const [draft, setDraft] = useState("");

  const todo = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  function add(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    addItem.mutate({ id: crypto.randomUUID(), name, addedBy: session.deviceId });
    setDraft("");
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
              <li key={item.id} className={s.item} {...animated(item.id)}>
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
                <li key={item.id} {...animated(item.id)}>
                  <Checkbox
                    className={`${s.check} ${s.doneCheck}`}
                    isSelected
                    onChange={() => setDone.mutate({ id: item.id, done: false })}
                  >
                    <s>{item.name}</s>
                  </Checkbox>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <Form className={s.addBar} onSubmit={add} data-vt="add-bar">
        <TextField
          label="Add item"
          placeholder="e.g. oat milk"
          value={draft}
          onChange={setDraft}
          maxLength={200}
          className={s.addField}
          inputProps={{ className: s.addInput, enterKeyHint: "done" }}
        />
        <Button type="submit" className={s.addButton}>
          Add
        </Button>
      </Form>
    </>
  );
}
