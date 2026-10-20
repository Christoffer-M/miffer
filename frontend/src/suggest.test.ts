import assert from "node:assert/strict";
import { test } from "node:test";
import { suggest } from "./suggest.ts";

const now = Date.parse("2026-10-20T12:00:00Z");
const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60 * 1000).toISOString();
const history = [
  { name: "Havremælk", count: 9, lastAddedAt: daysAgo(2) },
  { name: "mælk", count: 4, lastAddedAt: daysAgo(30) },
  { name: "Hakket oksekød", count: 3, lastAddedAt: daysAgo(200) },
];
const starter = ["Mælk", "Mel", "Mango", "Æg", "Æbler"];
const items = [
  { id: "1", name: "Mango", done: false },
  { id: "2", name: "Æbler", done: true },
];
const names = (s: { name: string }[]) => s.map((x) => x.name);

test("history first, the household's own spelling wins, exact names lead", () => {
  assert.deepEqual(names(suggest("m", history, starter, items)), ["mælk", "Mel", "Mango", "Havremælk"]);
  // Word starts match too, after names that start with the text.
  assert.deepEqual(names(suggest("oks", history, starter, items)), ["Hakket oksekød"]);
  assert.equal(suggest("oks", history, starter, items)[0].at, 7);
  // Inside a word (Danish compounds) comes last.
  assert.deepEqual(names(suggest("MÆLK", history, starter, items)), ["mælk", "Havremælk"]);
  assert.deepEqual(names(suggest("æ", history, starter, items)), ["Æg", "Æbler", "Havremælk", "mælk"]);
});

test("knows what's on the list or in the cart", () => {
  assert.equal(suggest("mango", history, starter, items)[0].item?.done, false);
  assert.equal(suggest("æb", history, starter, items)[0].item?.done, true);
});

test("nothing typed: things added 3+ times lately, else the starter list", () => {
  // Hakket oksekød is too old, Mel was added only twice; the starter list doesn't fill up the row.
  const withMel = [...history, { name: "Mel", count: 2, lastAddedAt: daysAgo(1) }];
  assert.deepEqual(names(suggest("", withMel, starter, items, 6, now)), ["Havremælk", "mælk"]);
  // Old things still come up when typed.
  assert.deepEqual(names(suggest("oks", history, starter, items, 5, now)), ["Hakket oksekød"]);
  // Nothing added 3 times yet: the starter list, minus what's on the list or in the cart.
  assert.deepEqual(names(suggest("", [], starter, items, 6, now)), ["Mælk", "Mel", "Æg"]);
  assert.deepEqual(names(suggest("", withMel.slice(3), starter, items, 6, now)), ["Mælk", "Mel", "Æg"]);
  // Everything added often is already on the list: also the starter list.
  const allOnList = [{ id: "3", name: "Havremælk", done: false }, { id: "4", name: "mælk", done: true }];
  assert.deepEqual(names(suggest("", history, starter, allOnList, 2, now)), ["Mel", "Mango"]);
});
