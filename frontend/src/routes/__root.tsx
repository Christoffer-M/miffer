import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, House, ShoppingBasket, Users } from "lucide-react";
import { connectLive, session, useToken } from "../api";
import { AskForNotifications } from "../components/AskForNotifications";
import { DueReminders } from "../components/DueReminders";
import { UndoSpot } from "../components/UndoBar";
import { changesPending } from "../mutations/settle";
import { meQuery } from "../queries/household";
import { refreshItems } from "../queries/items";
import { remindersQuery } from "../queries/reminders";
import s from "./__root.module.css";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // A phone that hasn't linked up yet can only see the Us screen and the name screen after it.
  beforeLoad: ({ location }) => {
    if (!session.token && !["/us", "/name"].includes(location.pathname)) throw redirect({ to: "/us" });
  },
  component: Root,
});

function Root() {
  const { queryClient } = Route.useRouteContext();
  const token = useToken();
  const path = useLocation({ select: (l) => l.pathname });
  const [undoSpot, setUndoSpot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!token) return;
    return connectLive((what) => {
      if (what === "members") queryClient.invalidateQueries(meQuery);
      // Not while this phone's own changes are on their way: the last one refetches (settle.ts).
      else if (changesPending(queryClient, what)) return;
      else if (what === "items") refreshItems(queryClient).catch(() => {});
      else queryClient.invalidateQueries(remindersQuery);
    });
  }, [token, queryClient]);

  return (
    <div className={s.screen}>
      <UndoSpot value={setUndoSpot}>
        <Outlet />
      </UndoSpot>
      {/* Not over the name screen, where a new household's code is waiting to be shared. */}
      {token && path !== "/name" && <AskForNotifications />}
      {/* After the notifications sheet, so a due reminder comes up on top of it. Just above the tabs, for its Undo. */}
      {token && path !== "/name" && <DueReminders undoSpot={undoSpot} />}
      {token && (
        <nav className={s.tabs} aria-label="miffer">
          <Link to="/" className={s.tab} activeOptions={{ exact: true }}>
            <House size={22} aria-hidden />
            Home
          </Link>
          <Link to="/groceries" className={s.tab}>
            <ShoppingBasket size={22} aria-hidden />
            Groceries
          </Link>
          <Link to="/reminders" className={s.tab}>
            <Bell size={22} aria-hidden />
            Reminders
          </Link>
          <Link to="/us" className={s.tab}>
            <Users size={22} aria-hidden />
            Us
          </Link>
        </nav>
      )}
    </div>
  );
}
