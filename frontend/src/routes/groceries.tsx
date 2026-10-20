import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import { session } from "../api";
import { Avatars } from "../brand";
import { CloseIcon } from "../icons";
import { itemsQuery, useAddItem, useClearDone, useRemoveItem, useSetDone } from "../items";

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
      <header className="list-header">
        <div className="row between">
          <span className="eyebrow">miffer</span>
          <span className={online ? "badge synced" : "badge offline"}>{online ? "Synced" : "Offline"}</span>
        </div>
        <div className="row between end">
          <h1 className="display">Groceries</h1>
          <Avatars />
        </div>
        <p className="muted">
          {todo.length} to get · {done.length} in the cart
        </p>
      </header>

      {!online && (
        <div className="notice">
          <strong>You're offline</strong>
          <span>Changes will sync when you reconnect.</span>
        </div>
      )}

      <main className="content list">
        {error && <p className="error">{error.message}</p>}
        {!isPending && items.length === 0 && <p className="muted empty">Nothing on the list yet.</p>}

        {todo.length > 0 && (
          <ul className="sheet">
            {todo.map((item) => (
              <li key={item.id} className="item">
                <label>
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => setDone.mutate({ id: item.id, done: true })}
                  />
                  <span>{item.name}</span>
                </label>
                <span className="muted small">{item.addedBy === session.deviceId ? "you" : "partner"}</span>
                <button
                  type="button"
                  className="icon-button"
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
            <div className="row between section-head">
              <span className="eyebrow muted">In the cart</span>
              <button type="button" className="text-button" onClick={() => clearDone.mutate()}>
                Clear
              </button>
            </div>
            <ul className="done-list">
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

      <form className="add-bar" onSubmit={add}>
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
        <button type="submit" className="button primary">
          Add
        </button>
      </form>
    </>
  );
}
