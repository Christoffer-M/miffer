import { type PointerEvent, type ReactNode, useRef, useState } from "react";
import s from "./SwipeRow.module.css";

type Action = { label: string; icon: ReactNode; onSwipe: () => void };

type Props = {
  children: ReactNode;
  /** Revealed and run when swiping right. */
  right: Action;
  /** Revealed and run when swiping left. */
  left: Action;
  /** Class for the sliding part, e.g. its layout and background. */
  className?: string;
};

const START = 10; // px of mostly sideways movement before it counts as a swipe
const TRIGGER = 0.35; // share of the row's width to drag before releasing triggers
const FLICK = 0.6; // px per ms: a fast flick triggers sooner
const FLICK_MIN = 60; // px a flick must at least travel

/**
 * A row you can swipe sideways to reveal and run an action. Vertical scrolling
 * stays with the browser (touch-action: pan-y). Swipes are an extra shortcut:
 * the row's own buttons still work for taps and screen readers.
 */
export function SwipeRow({ children, right, left, className }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; width: number; active: boolean; lastX: number; lastT: number; v: number } | null>(null);
  const suppressClick = useRef(false);

  const armed = (x: number, width: number) => Math.abs(x) >= width * TRIGGER;

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const width = rowRef.current?.offsetWidth ?? 1;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, width, active: false, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
    suppressClick.current = false;
  }

  function onPointerMove(e: PointerEvent) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(mx) < START && Math.abs(my) < START) return;
      // Mostly vertical: leave it to the browser's scrolling.
      if (Math.abs(my) >= Math.abs(mx)) {
        drag.current = null;
        return;
      }
      d.active = true;
      suppressClick.current = true;
      setDragging(true);
      rowRef.current?.setPointerCapture(e.pointerId);
      // Tell the checkbox or button under the finger that this is no longer a tap.
      e.target.dispatchEvent(new globalThis.PointerEvent("pointercancel", { bubbles: true, pointerId: e.pointerId }));
    }
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = (e.clientX - d.lastX) / dt;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    const x = Math.max(-d.width, Math.min(d.width, mx));
    if (armed(x, d.width) !== armed(dx, d.width)) navigator.vibrate?.(8);
    setDx(x);
  }

  function onPointerEnd(e: PointerEvent) {
    const d = drag.current;
    // Our own "pointercancel" above isn't trusted; only real ones end the drag.
    if (!d || e.pointerId !== d.id || !e.isTrusted) return;
    drag.current = null;
    if (!d.active) return;
    setDragging(false);
    const flick = Math.abs(d.v) >= FLICK && Math.abs(dx) >= FLICK_MIN && Math.sign(d.v) === Math.sign(dx);
    if (e.type === "pointerup" && (armed(dx, d.width) || flick)) {
      // Stay where the finger left it: the list animation carries the row on from here.
      (dx > 0 ? right : left).onSwipe();
    } else {
      setDx(0);
    }
  }

  const action = dx > 0 ? right : left;
  const isArmed = drag.current ? armed(dx, drag.current.width) : dx !== 0;

  return (
    <div
      ref={rowRef}
      className={s.row}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      // A swipe must not also count as a tap on what's under the finger.
      onClickCapture={(e) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {dx !== 0 && (
        <div className={`${s.under} ${dx > 0 ? s.right : s.left}`} data-armed={isArmed || undefined} aria-hidden="true">
          <span className={s.action}>
            {action.icon}
            {action.label}
          </span>
        </div>
      )}
      <div
        className={`${s.content} ${className ?? ""}`}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        data-dragging={dragging || undefined}
      >
        {children}
      </div>
    </div>
  );
}
