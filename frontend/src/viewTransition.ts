// Grocery list animations. A list change runs as a View Transition: every item
// has its own transition name (see [data-vt-item] in tokens.css), so the browser
// moves each item from its old spot to its new one, even from the list into the
// cart. The names are only switched on during list changes, so screen changes
// still slide the whole screen.

let running = 0;
let popping: string | null = null;

/** True for the item that was just ticked or unticked, so it pops on its way. */
export const isPopping = (id: string) => id === popping;

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Runs `update` (a change to the items in the query cache) as an animated list change.
 * Pass `pop` with an item id to make that item pop as it moves.
 */
export function animateListChange(update: () => void, pop?: string) {
  popping = pop ?? null;
  if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  const html = document.documentElement;
  running++;
  html.classList.add("list-transition");
  const transition = document.startViewTransition(async () => {
    update();
    // React Query tells React about cache changes on a timer, and React then
    // renders right away. Waiting two tasks means the browser's "after"
    // picture shows the new list, not the old one.
    await nextTask();
    await nextTask();
  });
  transition.finished.finally(() => {
    if (--running === 0) html.classList.remove("list-transition");
  });
}
