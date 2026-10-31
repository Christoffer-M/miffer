// What the server said last, kept on this phone so the app opens with it when there's no
// connection. Only the server's own answers are kept, not changes still on their way, so the
// lists come back as they were at the last sync.

const PREFIX = "miffer.last.";

/**
 * For a query: `queryFn` fetches and keeps the answer, `initialData` is the kept one (if any).
 * It counts as old, so it's refetched as soon as there's a connection.
 */
export function remembered<T>(name: string, fetch: () => Promise<T>) {
  const key = PREFIX + name;
  return {
    queryFn: async () => {
      const data = await fetch();
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch {} // full or blocked: it just won't be there offline
      return data;
    },
    initialData: (): T | undefined => {
      try {
        const saved = localStorage.getItem(key);
        return saved === null ? undefined : JSON.parse(saved);
      } catch {
        return undefined;
      }
    },
    initialDataUpdatedAt: 0,
  };
}

/** Forgets it all, for when this phone leaves its household. */
export function forgetAll() {
  for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key);
}
