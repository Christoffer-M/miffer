import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { session } from "../api";
import { Avatars, Wordmark } from "../brand";
import { BasketIcon, ChevronIcon } from "../icons";
import { itemsQuery } from "../items";

export const Route = createFileRoute("/")({ component: Home });

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function Home() {
  const { data: items = [] } = useQuery(itemsQuery);
  const todo = items.filter((i) => !i.done);
  const fromPartner = items.find((i) => i.addedBy && i.addedBy !== session.deviceId); // newest first

  return (
    <>
      <header className="bar">
        <Wordmark />
        <Avatars />
      </header>
      <main className="content">
        <h1 className="display">{greeting()}</h1>
        <Link to="/groceries" className="card">
          <div className="card-head">
            <span className="card-icon">
              <BasketIcon />
            </span>
            <div className="card-title">
              <strong>Groceries</strong>
              <span className="muted">
                {todo.length} to get · {items.length - todo.length} in the cart
              </span>
            </div>
            <ChevronIcon />
          </div>
          {todo.length > 0 && (
            <div className="chips">
              {todo.slice(0, 3).map((i) => (
                <span key={i.id} className="chip">
                  {i.name}
                </span>
              ))}
              {todo.length > 3 && <span className="chip muted">+{todo.length - 3} more</span>}
            </div>
          )}
          {fromPartner && <span className="muted small">Partner added {fromPartner.name}</span>}
        </Link>
      </main>
    </>
  );
}
