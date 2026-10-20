import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { connectLive, session, useToken } from "../api";
import { BasketIcon, HomeIcon, UsIcon } from "../icons";
import { itemsQuery } from "../items";

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
    return connectLive(() => queryClient.invalidateQueries(itemsQuery));
  }, [token, queryClient]);

  return (
    <div className="screen">
      <Outlet />
      {token && (
        <nav className="tabs" aria-label="miffer">
          <Link to="/" className="tab" activeOptions={{ exact: true }}>
            <HomeIcon />
            Home
          </Link>
          <Link to="/groceries" className="tab">
            <BasketIcon />
            Groceries
          </Link>
          <Link to="/us" className="tab">
            <UsIcon />
            Us
          </Link>
        </nav>
      )}
    </div>
  );
}
