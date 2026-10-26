import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, ChevronRight, ShoppingBasket } from "lucide-react";
import { session } from "../api";
import { Avatars, Wordmark } from "../brand";
import { useMembers } from "../queries/household";
import { itemsQuery } from "../queries/items";
import { remindersQuery } from "../queries/reminders";
import { clock, dueAt, formatWhen, sortReminders } from "../reminders";
import ui from "../ui.module.css";
import s from "./index.module.css";

export const Route = createFileRoute("/")({ component: Home });

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function Home() {
  const { data: items = [] } = useQuery(itemsQuery);
  const todo = items.filter((i) => !i.done);
  const { whoIs } = useMembers();
  const fromOthers = items.find((i) => i.addedBy && i.addedBy !== session.deviceId); // newest first
  const { data: reminders = [] } = useQuery(remindersQuery);
  const { due, upcoming } = sortReminders(reminders);
  const next = upcoming[0];

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
              <ShoppingBasket size={22} aria-hidden />
            </span>
            <div className={s.cardTitle}>
              <strong>Groceries</strong>
              <span>
                {todo.length} to get · {items.length - todo.length} in the cart
              </span>
            </div>
            <ChevronRight size={20} aria-hidden />
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
          {fromOthers && (
            <span className={`${ui.muted} ${ui.small}`}>
              {whoIs(fromOthers.addedBy)} added {fromOthers.name}
            </span>
          )}
        </Link>
        <Link to="/reminders" className={s.card}>
          <div className={s.cardHead}>
            <span className={s.cardIcon}>
              <Bell size={22} aria-hidden />
            </span>
            <div className={s.cardTitle}>
              <strong>Reminders</strong>
              <span>
                {due.length} due · {upcoming.length} coming up
              </span>
            </div>
            <ChevronRight size={20} aria-hidden />
          </div>
          {(due.length > 0 || next) && (
            <div className={s.reminders}>
              {due.length > 0 && (
                <div className={`${s.reminder} ${s.due}`}>
                  <strong>{due[0].title}</strong>
                  <span>Due {clock(new Date(dueAt(due[0])!))}</span>
                </div>
              )}
              {next && (
                <div className={s.reminder}>
                  <span>{next.title}</span>
                  <span className={ui.muted}>{dueAt(next) ? formatWhen(new Date(dueAt(next)!)) : "No time"}</span>
                </div>
              )}
            </div>
          )}
        </Link>
      </main>
    </>
  );
}
