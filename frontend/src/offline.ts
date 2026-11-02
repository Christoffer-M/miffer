import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

// Nothing is changed offline. A change made then is refused before it shows (main.tsx), and the
// screen says what didn't happen (OfflineNotice.tsx). Screens that act on a change straight away,
// like clearing the field or offering Undo, check isOffline() and leave things as they were.

export const isOffline = () => !onlineManager.isOnline();

/** Whether the phone has a connection, re-rendering when that changes (the Synced / Offline badge). */
export function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
  );
}

/** A change refused because the phone is offline; the message says which. */
export class OfflineError extends Error {}

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /** What didn't happen, when it's refused offline: "the item couldn't be added". */
      offline?: string;
    };
  }
}
