// Grocery list animations. A list change runs as a View Transition: every item
// has its own transition name (see [data-vt-item] in tokens.css), so the browser
// moves each item from its old spot to its new one, even from the list into the
// cart. The names are only switched on during list changes, so screen changes
// still slide the whole screen.

let running = 0;

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The marker that makes an item pop. Only ever on the item of the transition that's running. */
const clearPopping = () => document.querySelectorAll("[data-popping]").forEach((el) => el.removeAttribute("data-popping"));

type Options = {
  /** An item id: that item pops as it moves (it was just ticked or unticked). */
  pop?: string;
  /** Items are leaving the list: the rest waits until they've slid out before closing the gap. */
  removing?: boolean;
};

const supportsTypes = () => CSS.supports("selector(:active-view-transition-type(a))");

/** Runs `update` (a change to the items in the query cache) as an animated list change. */
export function animateListChange(update: () => void, { pop, removing }: Options = {}) {
  if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  // A marker left from an earlier change would make that item pop again.
  clearPopping();
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
    // Marked in the "after" state only, so just this item pops on its way.
    if (pop) document.querySelector(`[data-vt-item="${CSS.escape(pop)}"]`)?.setAttribute("data-popping", "");
  };
  // The "remove" type delays closing the gap (see tokens.css). Browsers without
  // transition types still animate, just without the delay.
  const transition =
    removing && supportsTypes()
      ? document.startViewTransition({ update: run, types: ["remove"] })
      : document.startViewTransition(run);
  transition.finished.finally(() => {
    if (pop) document.querySelector(`[data-vt-item="${CSS.escape(pop)}"]`)?.removeAttribute("data-popping");
    if (--running === 0) html.classList.remove("list-transition");
  });
}
