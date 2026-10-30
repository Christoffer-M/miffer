import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { api, ok, type Item } from "../api";
import { remembered } from "../remember";
import { animateListChange } from "../viewTransition";

const items = remembered("items", async () => (await ok(api.items.$get())).json());
const fetchItems = items.queryFn;

export const itemsQuery = queryOptions({
  queryKey: ["items"],
  ...items,
});

/**
 * What this household has added before, most often first: the source of suggestions.
 * Its key sits under "items", so invalidating the list after a change refreshes it too.
 */
export const historyQuery = queryOptions({
  queryKey: ["items", "history"],
  ...remembered("history", async () => (await ok(api.items.history.$get())).json()),
});

/** What the list looks like on screen: order, names and ticks. */
const looks = (items: Item[] = []) => JSON.stringify(items.map((i) => [i.id, i.name, i.done]));

/**
 * Fetches the list after a live "items" ping. If the list looks different (someone else
 * changed it) the change is animated on the Groceries screen. Our own changes come back
 * as pings too, but by then they're already on screen, so nothing animates twice.
 */
export async function refreshItems(qc: QueryClient) {
  qc.invalidateQueries(historyQuery); // the other phone may have added something new
  const fresh = await fetchItems();
  const write = () => qc.setQueryData(itemsQuery.queryKey, fresh);
  const current = qc.getQueryData(itemsQuery.queryKey) ?? [];
  const changed = looks(current) !== looks(fresh);
  // Match the animation to what happened on the other phone.
  const removed = current.some((i) => !fresh.some((f) => f.id === i.id));
  const checked = fresh.some((f) => current.some((i) => i.id === f.id && i.done !== f.done));
  const change = removed ? "remove" : checked ? "check" : undefined;
  if (changed && location.pathname === "/groceries") animateListChange(write, change);
  else write();
}
