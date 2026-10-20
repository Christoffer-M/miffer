export const lower = (s: string) => s.toLocaleLowerCase("da");

/** "You often get" leaves out things not added for this long, so old habits fade. */
const RECENT_MS = 90 * 24 * 60 * 60 * 1000;

type ListItem = { id: string; name: string; done: boolean };

export type Suggestion<I extends ListItem = ListItem> = {
  name: string;
  /** Times the household added it; 0 for the starter list. */
  count: number;
  /** Where the typed text starts in the name, for highlighting. */
  at: number;
  /** The item with this name on the list or in the cart, if any. */
  item?: I;
};

/** Where `q` starts a word in the name, else where it appears at all (Danish compounds:
 * "mælk" in "Havremælk"), else -1. */
function matchAt(name: string, q: string) {
  const l = lower(name);
  for (let i = 0; i < l.length; i++) {
    if ((i === 0 || /[\s-]/.test(l[i - 1])) && l.startsWith(q, i)) return i;
  }
  return l.indexOf(q);
}

/**
 * What to suggest for what's typed: the household's own history (most added first),
 * then the starter list. An exact name comes first, then names starting with the text,
 * then names with a later word starting with it, then names with it inside a word.
 * With nothing typed: what the household added in the last 3 months (most added first),
 * or the starter list if it has no history yet; either way, minus what's on the list or
 * in the cart.
 */
export function suggest<I extends ListItem>(
  query: string,
  history: { name: string; count: number; lastAddedAt: string }[],
  starter: string[],
  items: I[],
  max = 5,
  now = Date.now(),
): Suggestion<I>[] {
  const q = lower(query.trim());
  const byName = new Map(items.map((i) => [lower(i.name), i]));

  if (!q) {
    const usual = history.length
      ? history.filter((h) => Date.parse(h.lastAddedAt) > now - RECENT_MS)
      : starter.map((name) => ({ name, count: 0 }));
    return usual
      .filter((u) => !byName.has(lower(u.name)))
      .slice(0, max)
      .map(({ name, count }) => ({ name, count, at: 0 }));
  }

  const seen = new Set<string>();
  const all: Suggestion<I>[] = [];
  for (const { name, count } of [...history, ...starter.map((name) => ({ name, count: 0 }))]) {
    const key = lower(name);
    if (seen.has(key)) continue;
    seen.add(key);
    all.push({ name, count, at: matchAt(name, q), item: byName.get(key) });
  }
  // ponytail: a linear scan over a few hundred names per keystroke; index it if history grows to thousands.
  const rank = (s: Suggestion<I>) => {
    const l = lower(s.name);
    return l === q ? 0 : s.at === 0 ? 1 : /[\s-]/.test(l[s.at - 1]) ? 2 : 3;
  };
  return all
    .filter((s) => s.at >= 0)
    .sort((a, b) => rank(a) - rank(b)) // stable, so history order holds within a rank
    .slice(0, max);
}
