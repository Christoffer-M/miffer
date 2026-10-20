import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import { session } from "../api";
import { Avatars } from "../brand";
import { CloseIcon } from "../icons";
import { itemsQuery, useAddItem, useClearDone, useRemoveItem, useSetDone } from "../items";
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

function Groceries() {
  const { data: items = [], isPending, error } = useQuery(itemsQuery);
  const online = useOnline();
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
      <header className={s.header}>
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
          <ul className={s.sheet}>
            {todo.map((item) => (
              <li key={item.id} className={s.item}>
                <label>
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => setDone.mutate({ id: item.id, done: true })}
                  />
                  <span>{item.name}</span>
                </label>
                <span className={`${ui.muted} ${ui.small}`}>
                  {item.addedBy === session.deviceId ? "you" : "partner"}
                </span>
                <button
                  type="button"
                  className={ui.iconButton}
                  aria-label={`Remove ${item.name}`}
                  onClick={() => removeItem.mutate(item.id)}
                >
                  <CloseIcon />
                </button>
              </li>
            ))}
          </ul>
        )}

        {done.length > 0 && (
          <section>
            <div className={`${ui.row} ${s.sectionHead}`}>
              <span className={`${ui.eyebrow} ${ui.muted}`}>In the cart</span>
              <button type="button" className={ui.textButton} onClick={() => clearDone.mutate()}>
                Clear
              </button>
            </div>
            <ul className={s.doneList}>
              {done.map((item) => (
                <li key={item.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked
                      onChange={() => setDone.mutate({ id: item.id, done: false })}
                    />
                    <s>{item.name}</s>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <form className={s.addBar} onSubmit={add}>
        <label>
          Add item
          <input
            type="text"
            placeholder="e.g. oat milk"
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <button type="submit" className={`${ui.button} ${ui.primary}`}>
          Add
        </button>
      </form>
    </>
  );
}
