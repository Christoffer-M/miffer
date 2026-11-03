import {
  TextField as AriaTextField,
  Input,
  type InputProps,
  Label,
  type TextFieldProps,
  VisuallyHidden,
} from "react-aria-components";
import s from "./TextField.module.css";

/** What TextField and SearchField take besides their own React Aria props. */
export type FieldProps = {
  label: string;
  /** Keep the label for screen readers but don't show it. */
  hideLabel?: boolean;
  placeholder?: string;
  className?: string;
  /** Extra props for the <input>, e.g. autoCapitalize or a class for a special look. */
  inputProps?: Omit<InputProps, "placeholder">;
};

/** A field's label, kept for screen readers only when `hidden`. */
export function FieldLabel({ children, hidden }: { children: string; hidden?: boolean }) {
  const label = <Label className={s.label}>{children}</Label>;
  return hidden ? <VisuallyHidden>{label}</VisuallyHidden> : label;
}

/** The field's <input>, with `className` added to the usual look. */
export function FieldInput({ inputProps, placeholder, className }: Pick<FieldProps, "inputProps" | "placeholder"> & { className?: string }) {
  const { className: extra, ...rest } = inputProps ?? {};
  return (
    <Input
      {...rest}
      placeholder={placeholder}
      className={[s.input, className, typeof extra === "string" && extra].filter(Boolean).join(" ")}
    />
  );
}

/** A labelled text input. */
export function TextField({
  label,
  hideLabel,
  placeholder,
  className,
  inputProps,
  ...props
}: Omit<TextFieldProps, "className" | "children"> & FieldProps) {
  return (
    <AriaTextField {...props} className={`${s.field} ${className ?? ""}`}>
      <FieldLabel hidden={hideLabel}>{label}</FieldLabel>
      <FieldInput inputProps={inputProps} placeholder={placeholder} />
    </AriaTextField>
  );
}
