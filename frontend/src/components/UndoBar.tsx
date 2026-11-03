import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { UNSAFE_PortalProvider } from "react-aria";
import {
  Text,
  UNSTABLE_Toast as Toast,
  UNSTABLE_ToastContent as ToastContent,
  UNSTABLE_ToastQueue as ToastQueue,
  UNSTABLE_ToastRegion as ToastRegion,
} from "react-aria-components";
import { Undo2 } from "lucide-react";
import { isOffline } from "../offline";
import { Button } from "./Button";
import ui from "../ui.module.css";

/** How long Undo stays up. React Aria pauses it while the bar is hovered or has focus. */
const UNDO_MS = 6000;

type Undoable = { text: string; run: () => void };

/** A screen's Undo and a due reminder's can be up at once, the newest on top. */
const queue = new ToastQueue<Undoable>({ maxVisibleToasts: 2 });

/**
 * Offers to undo the last thing done, said in a few words: it takes the place of the last one
 * offered here. Offline nothing is offered, as the change itself was refused (offline.ts). An Undo
 * offered here goes when the component that offered it does (say, on leaving the screen), as
 * it's about what that screen showed.
 */
export function useUndo() {
  const mine = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (mine.current) queue.close(mine.current);
    },
    [],
  );
  const offer = useCallback((text: string, run: () => void) => {
    if (isOffline()) return;
    if (mine.current) queue.close(mine.current);
    mine.current = queue.add({ text, run }, { timeout: UNDO_MS });
  }, []);
  return { offer };
}

// Where Undo shows. A screen with a bar of its own at the bottom (Groceries' add bar, Watch's +
// button) offers a spot just above or beside it; the due reminder sheet offers one inside it while
// it's open, as the screen behind can't be tapped then. The highest priority wins, the latest of those.
type Spot = { el: HTMLElement; priority: number };
let spots: Spot[] = [];
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn));
const currentSpot = () =>
  spots.reduce<Spot | null>((best, s) => (!best || s.priority >= best.priority ? s : best), null)?.el ?? null;
const changed = () => listeners.forEach((fn) => fn());

/** A ref for the element Undo should show in while it's on screen. */
export function useUndoSpot(priority = 0) {
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      const spot = { el, priority };
      spots = [...spots, spot];
      changed();
      return () => {
        spots = spots.filter((s) => s !== spot);
        changed();
      };
    },
    [priority],
  );
}

/**
 * The dark Undo bar, as a React Aria toast: announced when it shows, reachable with F6, and kept
 * usable over a sheet. It shows in the current spot, or in `fallback` (just above the tabs).
 */export function UndoToasts({ fallback }: { fallback: HTMLElement | null }) {
  const spot = useSyncExternalStore(subscribe, currentSpot) ?? fallback;
  // The region always renders into this one element, which is moved to the current spot. Portalling
  // into the spot itself would remount the toast on every move, restarting its wait and announcing
  // it again (say, when the last due reminder is dealt with and Undo leaves the sheet).
  const [host] = useState(() => document.createElement("div"));
  useLayoutEffect(() => {
    spot?.appendChild(host);
    return () => host.remove();
  }, [spot, host]);
  return (
    <UNSAFE_PortalProvider getContainer={() => host}>
      {/* No aria-label: React Aria's own ("Notifications (1)") changes with the count, which is what
          registers the region for F6 once it shows. A fixed one leaves F6 unable to reach it. */}
      <ToastRegion queue={queue} className={ui.undoRegion}>
        {({ toast }) => (
          <Toast toast={toast} className={ui.undo}>
            <ToastContent className={ui.undoText}>
              <Text slot="title">{toast.content.text}</Text>
            </ToastContent>
            <Button
              variant="text"
              className={ui.undoButton}
              onPress={() => {
                toast.content.run();
                if (!isOffline()) queue.close(toast.key); // refused offline: it stays, to try again
              }}
            >
              <Undo2 size={18} aria-hidden />
              Undo
            </Button>
          </Toast>
        )}
      </ToastRegion>
    </UNSAFE_PortalProvider>
  );
}
