import { type ReactNode, useContext, useEffect, useRef } from "react";
import { Modal, OverlayTriggerStateContext } from "react-aria-components";
import s from "./Confirm.module.css";

const CLOSE = 0.25; // share of the sheet's height to drag down before letting go closes it
const FLICK = 0.5; // px per ms: a fast flick down closes sooner
const FLICK_MIN = 40; // px a flick must at least travel
const FLICK_STALE = 100; // ms: a finger held still this long before letting go isn't flicking
const SNAP = "200ms var(--ease-decelerate)";

type Drag = {
  x: number;
  y: number;
  dy: number;
  lastY: number;
  lastT: number;
  v: number;
  active: boolean;
  target: EventTarget | null;
};

/**
 * A sheet from the bottom of the screen: a <Modal> with the sheet styles (Confirm.module.css),
 * plus whatever `className` adds, and a bar at the top that says it swipes down to close.
 * Goes inside a <ModalOverlay>, like <Modal>.
 */
export function Sheet({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Modal className={className ? `${s.sheet} ${className}` : s.sheet}>
      <SwipeToClose />
      {children}
    </Modal>
  );
}

/**
 * Swiping the sheet down to close it. A drag only starts downwards, where nothing under the finger
 * is scrolled down and not in a text field, so scrolling a sheet's middle, swiping its rows
 * sideways and selecting text stay as they were. Tapping outside still closes it.
 *
 * Like SwipeRow, the finger position goes straight to the sheet's style, and the scrim lightens with
 * it. Closing leaves both there: the exit animations slide and fade on from where the finger let go.
 */
function SwipeToClose() {
  const ref = useRef<HTMLDivElement>(null);
  const state = useContext(OverlayTriggerStateContext);
  // The listeners below are set up once, so they read close from here.
  const close = useRef(state?.close);
  close.current = state?.close;

  useEffect(() => {
    const sheet = ref.current?.parentElement;
    const overlay = sheet?.parentElement;
    if (!sheet || !overlay) return;
    let drag: Drag | null = null;
    let pointerId = 0;
    let suppressClick = false;

    const startsHere = (target: EventTarget | null) => {
      if ((target as Element | null)?.closest?.("input, textarea, select, [contenteditable]")) return false;
      for (let el = target as HTMLElement | null; el && el !== overlay; el = el.parentElement) {
        if (el.scrollTop > 0) return false;
      }
      return true;
    };

    // The scrim is the overlay's background: its opacity would fade the sheet inside it too.
    const move = (dy: number, ease: boolean) => {
      const t = ease ? SNAP : "none";
      sheet.style.transition = `transform ${t}`;
      overlay.style.transition = `background-color ${t}`;
      sheet.style.transform = dy ? `translateY(${dy}px)` : "";
      const left = Math.max(0, 100 - (dy / sheet.offsetHeight) * 100);
      overlay.style.backgroundColor = dy ? `color-mix(in srgb, var(--scrim) ${left}%, transparent)` : "";
    };

    // Back where it was, then no inline transitions left behind.
    const settled = (e: TransitionEvent) => {
      if (e.target !== sheet) return;
      sheet.removeEventListener("transitionend", settled);
      sheet.style.transition = overlay.style.transition = "";
    };
    const snapBack = () => {
      move(0, true);
      sheet.addEventListener("transitionend", settled);
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerId = e.pointerId;
      suppressClick = false;
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        // A second finger: this is no longer a swipe.
        if (drag?.active) snapBack();
        drag = null;
        return;
      }
      const t = e.touches[0];
      drag = startsHere(e.target)
        ? { x: t.clientX, y: t.clientY, dy: 0, lastY: t.clientY, lastT: e.timeStamp, v: 0, active: false, target: e.target }
        : null;
    };

    const onMove = (e: TouchEvent) => {
      if (!drag) return;
      const t = e.touches[0];
      const dy = t.clientY - drag.y;
      if (!drag.active) {
        // Decided on the first move: later ones can't stop a scroll the browser has started.
        if (dy <= 0 || Math.abs(t.clientX - drag.x) > dy) {
          drag = null;
          return;
        }
        drag.active = true;
        suppressClick = true;
        // Tell the button under the finger that this is no longer a tap (as SwipeRow does).
        drag.target?.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId }));
      }
      e.preventDefault();
      const dt = e.timeStamp - drag.lastT;
      if (dt > 0) drag.v = (t.clientY - drag.lastY) / dt;
      drag.lastY = t.clientY;
      drag.lastT = e.timeStamp;
      drag.dy = Math.max(0, dy);
      move(drag.dy, false);
    };

    const onEnd = (e: TouchEvent) => {
      const d = drag;
      drag = null;
      if (!d?.active) return;
      const flick = d.v > FLICK && d.dy > FLICK_MIN && e.timeStamp - d.lastT < FLICK_STALE;
      // A cancelled touch (a system gesture, a call) never closes: the finger didn't let go.
      if (e.type === "touchend" && (d.dy > sheet.offsetHeight * CLOSE || flick)) close.current?.();
      else snapBack();
    };

    const onClick = (e: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    };

    sheet.addEventListener("pointerdown", onPointerDown, true);
    sheet.addEventListener("touchstart", onStart, { passive: true });
    sheet.addEventListener("touchmove", onMove, { passive: false });
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onEnd);
    sheet.addEventListener("click", onClick, true);
    return () => {
      sheet.removeEventListener("pointerdown", onPointerDown, true);
      sheet.removeEventListener("touchstart", onStart);
      sheet.removeEventListener("touchmove", onMove);
      sheet.removeEventListener("touchend", onEnd);
      sheet.removeEventListener("touchcancel", onEnd);
      sheet.removeEventListener("click", onClick, true);
      sheet.removeEventListener("transitionend", settled);
    };
  }, []);

  return <div ref={ref} className={s.grabber} aria-hidden />;
}
