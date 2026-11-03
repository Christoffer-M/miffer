import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  Text,
  UNSTABLE_Toast as Toast,
  UNSTABLE_ToastContent as ToastContent,
  UNSTABLE_ToastQueue as ToastQueue,
  UNSTABLE_ToastRegion as ToastRegion,
} from "react-aria-components";
import { WifiOff } from "lucide-react";
import { OfflineError } from "../offline";
import s from "./OfflineNotice.module.css";

/** How long it stays up. React Aria pauses it while it's hovered or has focus. */
const SHOW_MS = 5000;

/** One at a time: a second refusal takes the place of the first, and shows for as long. */
const queue = new ToastQueue<{ message: string }>({ maxVisibleToasts: 1 });

/** Says what didn't happen, at the top of the screen, when a change is refused because the phone is offline. */
export function OfflineNotice() {
  const qc = useQueryClient();

  useEffect(
    () =>
      qc.getMutationCache().subscribe((e) => {
        if (e.type === "updated" && e.action.type === "error" && e.action.error instanceof OfflineError) {
          queue.clear();
          queue.add({ message: e.action.error.message }, { timeout: SHOW_MS });
        }
      }),
    [qc],
  );
  // Back online: it can be tried again, nothing left to say.
  useEffect(() => onlineManager.subscribe((online) => online && queue.clear()), []);

  // Portalled to the end of the page, so it floats over the header and over a sheet. No aria-label,
  // so F6 can reach it (see UndoBar.tsx).
  return (
    <ToastRegion queue={queue} className={s.region}>
      {({ toast }) => (
        <Toast toast={toast} className={s.notice}>
          <WifiOff size={20} aria-hidden />
          <ToastContent>
            <Text slot="title" elementType="strong">
              {toast.content.message}
            </Text>
            <Text slot="description">Try again when you're back online.</Text>
          </ToastContent>
        </Toast>
      )}
    </ToastRegion>
  );
}
