import type { WSContext } from "hono/ws";

// ponytail: in-memory pub/sub, so it only works with one backend process.
// Running more than one? Send notify() through Postgres LISTEN/NOTIFY instead.
const sockets = new Map<string, Set<WSContext>>();

export function subscribe(householdId: string, ws: WSContext) {
  const set = sockets.get(householdId) ?? new Set();
  set.add(ws);
  sockets.set(householdId, set);
}

export function unsubscribe(householdId: string, ws: WSContext) {
  const set = sockets.get(householdId);
  set?.delete(ws);
  if (set?.size === 0) sockets.delete(householdId);
}

/** Tell every phone in the household that its items changed; they refetch. */
export function notify(householdId: string) {
  sockets.get(householdId)?.forEach((ws) => ws.send("items"));
}

/** nginx drops WebSockets idle for 60s, so ping every 30s. */
export function startHeartbeat() {
  return setInterval(() => {
    for (const set of sockets.values()) set.forEach((ws) => ws.send("ping"));
  }, 30_000);
}
