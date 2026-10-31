import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { OfflineError } from "../offline";
import s from "./OfflineNotice.module.css";

/** How long it stays up. */
const SHOW_MS = 5000;

/** Says what didn't happen, at the top of the screen, when a change is refused because the phone is offline. */
export function OfflineNotice() {
  const qc = useQueryClient();
  const [refused, setRefused] = useState<{ message: string } | null>(null);

  useEffect(
    () =>
      qc.getMutationCache().subscribe((e) => {
        if (e.type === "updated" && e.action.type === "error" && e.action.error instanceof OfflineError) {
          setRefused({ message: e.action.error.message }); // a new object, so a second refusal shows for as long
        }
      }),
    [qc],
  );
  // Back online: it can be tried again, nothing left to say.
  useEffect(() => onlineManager.subscribe((online) => online && setRefused(null)), []);
  useEffect(() => {
    if (!refused) return;
    const timer = setTimeout(() => setRefused(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [refused]);

  return (
    // Always there (empty in between) so screen readers announce it.
    <div className={s.slot} role="status">
      {refused && (
        <div className={s.notice}>
          <WifiOff size={20} aria-hidden />
          <span>
            <strong>{refused.message}</strong>
            Try again when you're back online.
          </span>
        </div>
      )}
    </div>
  );
}
