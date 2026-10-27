import { createContext } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "./Button";
import ui from "../ui.module.css";

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
