import { useContext, useEffect, useRef } from "react";
import { OverlayTriggerStateContext } from "react-aria-components";
import s from "./Confirm.module.css";

const CLOSE = 0.25; // share of the sheet's height to drag down before letting go closes it
const FLICK = 0.5; // px per ms: a fast flick down closes sooner
const FLICK_MIN = 40; // px a flick must at least travel

type Drag = { x: number; y: number; dy: number; lastY: number; lastT: number; v: number; active: boolean };

/**
 * The bar at the top of a sheet, and swiping the sheet down to close it. Goes first inside a <Modal>.
 * A drag only starts where nothing under the finger is scrolled down, and only downwards, so
 * scrolling a sheet's middle (or its rows sideways) stays a scroll. Tapping outside still closes it.
 *
 * Like SwipeRow, the finger position goes straight to the sheet's style. Closing leaves it there:
 * the exit animation (Confirm.module.css) slides on down from wherever the finger let go.
 */
export function SheetGrabber() {
  const ref = useRef<HTMLDivElement>(null);
  const state = useContext(OverlayTriggerStateContext);
  // The listeners below are set up once, so they read close from here.
  const close = useRef(state?.close);
  close.current = state?.close;

  useEffect(() => {
    const sheet = ref.current?.parentElement;
    if (!sheet) return;
    let drag: Drag | null = null;

    const scrolled = (target: EventTarget | null) => {
      for (let el = target as HTMLElement | null; el && el !== sheet.parentElement; el = el.parentElement) {
        if (el.scrollTop > 0) return true;
      }
      return false;
    };

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      drag =
        e.touches.length === 1 && !scrolled(e.target)
          ? { x: t.clientX, y: t.clientY, dy: 0, lastY: t.clientY, lastT: e.timeStamp, v: 0, active: false }
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
        sheet.style.transition = "none";
      }
      e.preventDefault();
      const dt = e.timeStamp - drag.lastT;
      if (dt > 0) drag.v = (t.clientY - drag.lastY) / dt;
      drag.lastY = t.clientY;
      drag.lastT = e.timeStamp;
      drag.dy = Math.max(0, dy);
      sheet.style.transform = `translateY(${drag.dy}px)`;
    };

    const onEnd = () => {
      if (!drag?.active) {
        drag = null;
        return;
      }
      const { dy, v } = drag;
      drag = null;
      if (dy > sheet.offsetHeight * CLOSE || (v > FLICK && dy > FLICK_MIN)) {
        close.current?.();
      } else {
        sheet.style.transition = "transform 200ms var(--ease-decelerate)";
        sheet.style.transform = "";
      }
    };

    sheet.addEventListener("touchstart", onStart, { passive: true });
    sheet.addEventListener("touchmove", onMove, { passive: false });
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onEnd);
    return () => {
      sheet.removeEventListener("touchstart", onStart);
      sheet.removeEventListener("touchmove", onMove);
      sheet.removeEventListener("touchend", onEnd);
      sheet.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return <div ref={ref} className={s.grabber} aria-hidden />;
}
