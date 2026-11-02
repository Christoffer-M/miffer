import { createContext, useEffect, useState } from "react";
import { Undo2 } from "lucide-react";
import { isOffline } from "../offline";
import { Button } from "./Button";
import ui from "../ui.module.css";

/** How long Undo stays up. */
const UNDO_MS = 6000;

/**
 * What an Undo would put back: it goes again after a while, and a new one takes its place and
 * starts the wait over. Every Undo in the app waits through this, so they all last as long.
 */
export function useUndoable<T>() {
  const [undoable, setUndoable] = useState<T | null>(null);

  useEffect(() => {
    if (undoable === null) return;
    const timer = setTimeout(() => setUndoable(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undoable]);

  return [undoable, setUndoable] as const;
}

/**
 * The last thing done that can be undone, for an UndoBar: a new one takes its place, and it
 * goes after a while. Offline nothing is offered, as the change itself was refused (offline.ts).
 */
export function useUndo() {
  const [undo, setUndo] = useUndoable<{ text: string; run: () => void }>();

  return {
    /** What Undo would undo, said in a few words; null when there's nothing. */
    text: undo?.text ?? null,
    offer: (text: string, run: () => void) => {
      if (!isOffline()) setUndo({ text, run });
    },
    run: () => {
      undo?.run();
      if (!isOffline()) setUndo(null);
    },
  };
}

/** The dark Undo bar after removing groceries or dealing with a due reminder. */
export function UndoBar({ text, onUndo, className = "" }: { text: string; onUndo: () => void; className?: string }) {
  return (
    <div className={`${ui.undo} ${className}`}>
      <span className={ui.undoText}>{text}</span>
      <Button variant="text" className={ui.undoButton} onPress={onUndo}>
        <Undo2 size={18} aria-hidden />
        Undo
      </Button>
    </div>
  );
}

/**
 * A screen with a bar of its own at the bottom (Groceries' add bar) hands over a spot just above it,
 * so a due reminder's Undo shows there instead of on top of that bar (DueReminders.tsx).
 */
export const UndoSpot = createContext<(spot: HTMLElement | null) => void>(() => {});
