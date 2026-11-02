import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { api, ok, type Watch } from "../api";
import { remembered } from "../remember";
import { showsList } from "../watch";
import { animateListChange } from "../viewTransition";

const watch = remembered("watch", async () => (await ok(api.watch.$get())).json());

export const watchQuery = queryOptions({
  queryKey: ["watch"],
  ...watch,
});

/** Movies and series on TMDB for what was typed. Not kept: it's only for adding, which needs a connection. */
export const searchQuery = (q: string) =>
  queryOptions({
    queryKey: ["search", q],
    queryFn: async () => (await ok(api.watch.search.$get({ query: { q } }))).json(),
    enabled: q.length >= 2,
    staleTime: Infinity,
    retry: false,
  });

/** What the Watch screens show: order, titles and what's been watched. */
const looks = (list: Watch[] = []) => JSON.stringify(list.map((w) => [w.id, w.title, w.watchedAt]));

/** Fetches the list after a live "watch" ping, animating someone else's change as for groceries (items.ts). */
export async function refreshWatch(qc: QueryClient) {
  const fresh = await watch.queryFn();
  const write = () => qc.setQueryData(watchQuery.queryKey, fresh);
  const current = qc.getQueryData(watchQuery.queryKey) ?? [];
  const removed = current.some((w) => !fresh.some((f) => f.id === w.id));
  const moved = fresh.some((f) => current.some((w) => w.id === f.id && !w.watchedAt !== !f.watchedAt));
  const change = removed ? "remove" : moved ? "check" : undefined;
  if (looks(current) !== looks(fresh) && showsList()) animateListChange(write, change);
  else write();
}
