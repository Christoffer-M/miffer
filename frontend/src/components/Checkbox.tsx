import type { ReactNode } from "react";
import { Checkbox as AriaCheckbox, type CheckboxProps } from "react-aria-components";
import s from "./Checkbox.module.css";

type Props = Omit<CheckboxProps, "className" | "children"> & { children: ReactNode; className?: string };

/** A round-cornered checkbox with its label; the whole row is the tap target. */
export function Checkbox({ children, className, ...props }: Props) {
  return (
    <AriaCheckbox {...props} className={`${s.checkbox} ${className ?? ""}`}>
      <span className={s.box} aria-hidden="true">
        <svg viewBox="0 0 18 18">
          <polyline points="3.5 9.5 7.5 13.5 14.5 5" />
        </svg>
      </span>
      {children}
    </AriaCheckbox>
  );
}
