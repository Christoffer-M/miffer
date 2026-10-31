import { onlineManager } from "@tanstack/react-query";

// Nothing is changed offline. A change made then is refused before it shows (main.tsx), and the
// screen says what didn't happen (OfflineNotice.tsx). Screens that act on a change straight away,
// like clearing the field or offering Undo, check isOffline() and leave things as they were.

export const isOffline = () => !onlineManager.isOnline();

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
