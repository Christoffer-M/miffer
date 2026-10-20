import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { api, ok, type Item } from "../api";
import { animateListChange } from "../viewTransition";

const fetchItems = async () => (await ok(api.items.$get())).json();

export const itemsQuery = queryOptions({
  queryKey: ["items"],
  queryFn: fetchItems,
});

/** What the list looks like on screen: order, names and ticks. */
const looks = (items: Item[] = []) => JSON.stringify(items.map((i) => [i.id, i.name, i.done]));

/**
 * Fetches the list after a live "items" ping. If the list looks different (someone else
 * changed it) the change is animated on the Groceries screen. Our own changes come back
 * as pings too, but by then they're already on screen, so nothing animates twice.
 */
export async function refreshItems(qc: QueryClient) {
  const fresh = await fetchItems();
  const write = () => qc.setQueryData(itemsQuery.queryKey, fresh);
  const changed = looks(qc.getQueryData(itemsQuery.queryKey)) !== looks(fresh);
  if (changed && location.pathname === "/groceries") animateListChange(write);
  else write();
}
