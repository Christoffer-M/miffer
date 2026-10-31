import { type PointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { isOffline } from "../offline";
import s from "./SwipeRow.module.css";

type Action = {
  label: string;
  icon: ReactNode;
  onSwipe: () => void;
  /** The panel's colour, instead of green (right) or red (left). White text on it must pass 4.5:1. */
  color?: string;
};

type Props = {
  children: ReactNode;
  /** Revealed and run when swiping right. Without it the row doesn't move right. */
  right?: Action;
  /** Revealed and run when swiping left. Without it the row doesn't move left. */
  left?: Action;
  /** Class for the sliding part, e.g. its layout and background. */
  className?: string;
};

type Side = "left" | "right";

type Drag = {
  id: number;
  x: number;
  y: number;
  width: number;
  active: boolean;
  lastX: number;
  lastT: number;
  v: number;
  dx: number;
  side: Side | null;
  armed: boolean;
};

const START = 10; // px of mostly sideways movement before it counts as a swipe
const TRIGGER = 0.35; // share of the row's width to drag before releasing triggers
const FLICK = 0.6; // px per ms: a fast flick triggers sooner
const FLICK_MIN = 60; // px a flick must at least travel

/**
 * A row you can swipe sideways to reveal and run an action. Vertical scrolling
 * stays with the browser (touch-action: pan-y). Swipes are an extra shortcut:
 * the row's own buttons still work for taps and screen readers.
 *
 * The finger position is written straight to the row's style on every move, so
 * dragging never waits on React. React only re-renders when the panel underneath
 * changes: which side it's on, or whether letting go would trigger it.
 */
export function SwipeRow({ children, right, left, className }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<Side | null>(null);
  const [armed, setArmed] = useState(false);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  // The window listeners below are set up once, so they read the actions from here.
  const actions = useRef({ right, left });
  actions.current = { right, left };

  // The release is caught on the window, not the row: if a list animation starts
  // mid-swipe, the pointerup can land on the page instead, which would leave the row stuck.
  const release = useMemo(() => {
    function listen() {
      window.addEventListener("pointerup", end, true);
      window.addEventListener("pointercancel", end, true);
    }
    function stop() {
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
    }
    function end(e: globalThis.PointerEvent) {
      const d = drag.current;
      const content = contentRef.current;
      // Our own "pointercancel" (see onPointerMove) isn't trusted; only real ones end the drag.
      if (!d || !content || e.pointerId !== d.id || !e.isTrusted) return;
      stop();
      drag.current = null;
      if (!d.active) return;
      delete content.dataset.dragging;
      const flick = Math.abs(d.v) >= FLICK && Math.abs(d.dx) >= FLICK_MIN && Math.sign(d.v) === Math.sign(d.dx);
      const swiped = e.type === "pointerup" && d.dx !== 0 && (d.armed || flick);
      // Offline the change is refused and the row stays in the list, so it springs back (offline.ts).
      if (swiped && !isOffline()) {
        // Stay where the finger left it: the list animation carries the row on from here.
        setArmed(true);
      } else {
        // Spring back (the CSS transition animates it); the panel goes once it's home.
        content.style.transform = "";
        setArmed(false);
      }
      if (swiped) (d.dx > 0 ? actions.current.right : actions.current.left)?.onSwipe();
    }
    return { listen, stop };
  }, []);

  // A row removed mid-swipe (say, someone else deleted the item) mustn't leave listeners behind.
  useEffect(() => release.stop, [release]);

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    release.stop(); // from an earlier gesture that never got its release
    release.listen();
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      width: rowRef.current?.offsetWidth ?? 1,
      active: false,
      lastX: e.clientX,
      lastT: e.timeStamp,
      v: 0,
      dx: 0,
      side: null,
      armed: false,
    };
    suppressClick.current = false;
  }

  function onPointerMove(e: PointerEvent) {
    const d = drag.current;
    const content = contentRef.current;
    if (!d || !content || e.pointerId !== d.id) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(mx) < START && Math.abs(my) < START) return;
      // Mostly vertical: leave it to the browser's scrolling.
      if (Math.abs(my) >= Math.abs(mx)) {
        release.stop();
        drag.current = null;
        return;
      }
      d.active = true;
      suppressClick.current = true;
      content.dataset.dragging = ""; // no easing while the finger is down (see the CSS)
      rowRef.current?.setPointerCapture(e.pointerId);
      // Tell the checkbox or button under the finger that this is no longer a tap.
      e.target.dispatchEvent(new globalThis.PointerEvent("pointercancel", { bubbles: true, pointerId: e.pointerId }));
    }
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = (e.clientX - d.lastX) / dt;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;

    d.dx = Math.max(left ? -d.width : 0, Math.min(right ? d.width : 0, mx));
    content.style.transform = `translateX(${d.dx}px)`;

    // Only these two reach React, and only when they change.
    const nextSide: Side | null = d.dx > 0 ? "right" : d.dx < 0 ? "left" : null;
    if (nextSide !== d.side) {
      d.side = nextSide;
      if (nextSide) setSide(nextSide);
    }
    const nextArmed = Math.abs(d.dx) >= d.width * TRIGGER;
    if (nextArmed !== d.armed) {
      d.armed = nextArmed;
      setArmed(nextArmed);
      navigator.vibrate?.(8);
    }
  }

  const action = side === "right" ? right : side === "left" ? left : undefined;

  return (
    <div
      ref={rowRef}
      className={s.row}
      // Capture phase: React Aria stops pointerdown from bubbling out of the checkbox
      // and buttons, so a swipe starting on them would never reach a normal listener.
      onPointerDownCapture={onPointerDown}
      onPointerMoveCapture={onPointerMove}
      // A swipe must not also count as a tap on what's under the finger.
      onClickCapture={(e) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {action && (
        <div
          className={`${s.under} ${side === "right" ? s.right : s.left}`}
          style={{ background: action.color }}
          data-armed={armed || undefined}
          aria-hidden="true"
        >
          <span className={s.action}>
            {action.icon}
            {action.label}
          </span>
        </div>
      )}
      <div
        ref={contentRef}
        className={`${s.content} ${className ?? ""}`}
        onTransitionEnd={(e) => {
          // Back at rest after springing back: hide the panel underneath.
          if (e.target === e.currentTarget && !drag.current && !e.currentTarget.style.transform) setSide(null);
        }}
      >
        {children}
      </div>
    </div>
  );
}
