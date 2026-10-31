import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import s from "./OfflineNotice.module.css";

/** How long it stays up after the last change. */
const SHOW_MS = 5000;

/**
 * Says so at the top of the screen when something is changed without a connection: the change
 * waits on this phone and is sent once it's back online, but only if miffer is still open then.
 */
export function OfflineNotice() {
  const qc = useQueryClient();
  const [shownAt, setShownAt] = useState(0);

  // A change is added to the cache as it's made; offline it then waits (paused) to be sent.
  useEffect(
    () =>
      qc.getMutationCache().subscribe((e) => {
        if (e.type === "added" && !onlineManager.isOnline()) setShownAt(Date.now());
      }),
    [qc],
  );
  // Back online: the changes are on their way, nothing left to say.
  useEffect(() => onlineManager.subscribe((online) => online && setShownAt(0)), []);
  useEffect(() => {
    if (!shownAt) return;
    const timer = setTimeout(() => setShownAt(0), SHOW_MS);
    return () => clearTimeout(timer);
  }, [shownAt]);

  return (
    // Always there (empty in between) so screen readers announce it.
    <div className={s.slot} role="status">
      {shownAt > 0 && (
        <div key={shownAt} className={s.notice}>
          <WifiOff size={20} aria-hidden />
          <span>
            <strong>You're offline</strong>
            That's sent once you're back online. Keep miffer open till then.
          </span>
        </div>
      )}
    </div>
  );
}
