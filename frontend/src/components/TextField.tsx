import {
  TextField as AriaTextField,
  Input,
  type InputProps,
  Label,
  type TextFieldProps,
} from "react-aria-components";
import s from "./TextField.module.css";

type Props = Omit<TextFieldProps, "className" | "children"> & {
  label: string;
  /** Keep the label for screen readers but don't show it. */
  hideLabel?: boolean;
  placeholder?: string;
  className?: string;
  /** Extra props for the <input>, e.g. autoCapitalize or a class for a special look. */
  inputProps?: Omit<InputProps, "placeholder">;
};

/** A labelled text input. */
export function TextField({ label, hideLabel, placeholder, className, inputProps, ...props }: Props) {
  const { className: inputClass, ...restInput } = inputProps ?? {};
  return (
    <AriaTextField {...props} className={`${s.field} ${className ?? ""}`}>
      <Label className={hideLabel ? s.hidden : s.label}>{label}</Label>
      <Input {...restInput} placeholder={placeholder} className={`${s.input} ${typeof inputClass === "string" ? inputClass : ""}`} />
    </AriaTextField>
  );
}
