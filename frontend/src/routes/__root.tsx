import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { House, ShoppingBasket, Users } from "lucide-react";
import { connectLive, session, useToken } from "../api";
import { meQuery } from "../queries/household";
import { refreshItems } from "../queries/items";
import s from "./__root.module.css";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // A phone that hasn't linked up yet can only see the Us screen.
  beforeLoad: ({ location }) => {
    if (!session.token && location.pathname !== "/us") throw redirect({ to: "/us" });
  },
  component: Root,
});

function Root() {
  const { queryClient } = Route.useRouteContext();
  const token = useToken();

  useEffect(() => {
    if (!token) return;
    return connectLive((what) => {
      if (what === "items") refreshItems(queryClient).catch(() => {});
      else queryClient.invalidateQueries(meQuery);
    });
  }, [token, queryClient]);

  return (
    <div className={s.screen}>
      <Outlet />
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
          <Link to="/us" className={s.tab}>
            <Users size={22} aria-hidden />
            Us
          </Link>
        </nav>
      )}
    </div>
  );
}
