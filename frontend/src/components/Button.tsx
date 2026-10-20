import { Button as AriaButton, type ButtonProps } from "react-aria-components";
import s from "./Button.module.css";

export type ButtonVariant = "primary" | "outline" | "danger" | "text" | "icon";

/** Class names for a button look, e.g. for a router <Link> that should look like a button. */
export const buttonClass = (variant: ButtonVariant) => `${s.base} ${s[variant]}`;

type Props = Omit<ButtonProps, "className"> & { variant?: ButtonVariant; className?: string };

export function Button({ variant = "primary", className, ...props }: Props) {
  return <AriaButton {...props} className={`${buttonClass(variant)} ${className ?? ""}`} />;
}
