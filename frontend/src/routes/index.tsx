import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { session } from "../api";
import { Avatars, Wordmark } from "../brand";
import { BasketIcon, ChevronIcon } from "../icons";
import { itemsQuery } from "../items";
import ui from "../ui.module.css";
import s from "./-home.module.css";

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
      <header className={s.bar}>
        <Wordmark />
        <Avatars />
      </header>
      <main className={ui.content}>
        <h1 className={ui.display}>{greeting()}</h1>
        <Link to="/groceries" className={s.card}>
          <div className={s.cardHead}>
            <span className={s.cardIcon}>
              <BasketIcon />
            </span>
            <div className={s.cardTitle}>
              <strong>Groceries</strong>
              <span>
                {todo.length} to get · {items.length - todo.length} in the cart
              </span>
            </div>
            <ChevronIcon />
          </div>
          {todo.length > 0 && (
            <div className={s.chips}>
              {todo.slice(0, 3).map((i) => (
                <span key={i.id} className={s.chip}>
                  {i.name}
                </span>
              ))}
              {todo.length > 3 && <span className={`${s.chip} ${ui.muted}`}>+{todo.length - 3} more</span>}
            </div>
          )}
          {fromPartner && <span className={`${ui.muted} ${ui.small}`}>Partner added {fromPartner.name}</span>}
        </Link>
      </main>
    </>
  );
}
