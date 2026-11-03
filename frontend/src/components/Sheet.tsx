import {
  Sheet as AriaSheet,
  type DialogProps,
  SheetBackdrop,
  SheetContent,
  SheetOverlay,
  type SheetOverlayProps,
} from "react-aria-components";
import s from "./Sheet.module.css";

type Props = Pick<SheetOverlayProps, "isOpen" | "onOpenChange"> &
  Pick<DialogProps, "role" | "children"> & {
    /** On the sheet, e.g. a taller max-height. */
    className?: string;
    /** On its content (the dialog), e.g. its own padding or gap. */
    contentClassName?: string;
  };

/**
 * A sheet from the bottom of the screen: react-aria's Sheet, set up as in its docs. Swiping it down,
 * tapping outside or pressing Escape closes it. Goes inside a SheetTrigger, or takes isOpen.
 * Children are the dialog's, so a function gets `close`.
 */
export function Sheet({ className, contentClassName, role, children, ...props }: Props) {
  return (
    <SheetOverlay {...props} className={s.overlay}>
      <SheetBackdrop className={s.backdrop} swipeAnimation={s.fade} />
      <AriaSheet overscrollPadding className={className ? `${s.sheet} ${className}` : s.sheet}>
        <div className={s.grabber} aria-hidden />
        <SheetContent role={role} className={contentClassName ? `${s.content} ${contentClassName}` : s.content}>
          {children}
        </SheetContent>
      </AriaSheet>
    </SheetOverlay>
  );
}
