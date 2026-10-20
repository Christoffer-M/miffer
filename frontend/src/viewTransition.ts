// Grocery list animations. A list change runs as a View Transition: every item
// has its own transition name (see [data-vt-item] in tokens.css), so the browser
// animates each item leaving, arriving or shifting. The names are only switched
// on during list changes, so screen changes still slide the whole screen.

/**
 * What kind of change this is, matching the swipes:
 * - "remove": items leave by sliding left (delete, Clear).
 * - "check": an item slides right out of its list and drops into the other (tick, put back).
 * With either, the rest of the list waits until the item has slid out before closing the gap.
 */
export type ListChange = "remove" | "check";

let running = 0;

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

const supportsTypes = () => CSS.supports("selector(:active-view-transition-type(a))");

/** Runs `update` (a change to the items in the query cache) as an animated list change. */
export function animateListChange(update: () => void, change?: ListChange) {
  if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  const html = document.documentElement;
  running++;
  html.classList.add("list-transition");
  const run = async () => {
    update();
    // React Query tells React about cache changes on a timer, and React then
    // renders right away. Waiting two tasks means the browser's "after"
    // picture shows the new list, not the old one.
    await nextTask();
    await nextTask();
  };
  // Browsers without transition types still animate, just without the direction and delay.
  const transition =
    change && supportsTypes()
      ? document.startViewTransition({ update: run, types: [change] })
      : document.startViewTransition(run);
  transition.finished.finally(() => {
    if (--running === 0) html.classList.remove("list-transition");
  });
}
