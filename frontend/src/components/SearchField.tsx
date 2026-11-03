import { X } from "lucide-react";
import {
  Button as AriaButton,
  SearchField as AriaSearchField,
  Input,
  type InputProps,
  Label,
  type SearchFieldProps,
  VisuallyHidden,
} from "react-aria-components";
import field from "./TextField.module.css";
import s from "./SearchField.module.css";

type Props = Omit<SearchFieldProps, "className" | "children"> & {
  label: string;
  /** Keep the label for screen readers but don't show it. */
  hideLabel?: boolean;
  placeholder?: string;
  className?: string;
  /** Extra props for the <input>, e.g. a class for a special look. */
  inputProps?: Omit<InputProps, "placeholder">;
};

/**
 * A labelled search input, like TextField, with a clear button while it has text. Escape clears it
 * too. The clear button keeps focus (and the phone keyboard) on the field.
 */
export function SearchField({ label, hideLabel, placeholder, className, inputProps, ...props }: Props) {
  const { className: inputClass, ...restInput } = inputProps ?? {};
  const labelEl = <Label className={field.label}>{label}</Label>;
  return (
    <AriaSearchField {...props} className={`${field.field} ${s.field} ${className ?? ""}`}>
      {hideLabel ? <VisuallyHidden>{labelEl}</VisuallyHidden> : labelEl}
      <div className={s.box}>
        <Input
          {...restInput}
          placeholder={placeholder}
          className={`${field.input} ${s.input} ${typeof inputClass === "string" ? inputClass : ""}`}
        />
        <AriaButton className={s.clear}>
          <X size={18} aria-hidden />
        </AriaButton>
      </div>
    </AriaSearchField>
  );
}
