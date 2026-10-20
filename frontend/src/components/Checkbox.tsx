import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Checkbox as AriaCheckbox, type CheckboxProps } from "react-aria-components";
import s from "./Checkbox.module.css";

type Props = Omit<CheckboxProps, "className" | "children"> & { children: ReactNode; className?: string };

/** A round-cornered checkbox with its label; the whole row is the tap target. */
export function Checkbox({ children, className, ...props }: Props) {
  return (
    <AriaCheckbox {...props} className={`${s.checkbox} ${className ?? ""}`}>
      <span className={s.box} aria-hidden="true">
        <Check size={16} strokeWidth={3} />
      </span>
      {children}
    </AriaCheckbox>
  );
}
