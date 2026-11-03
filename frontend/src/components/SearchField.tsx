import { X } from "lucide-react";
import { Button as AriaButton, SearchField as AriaSearchField, type SearchFieldProps } from "react-aria-components";
import { FieldInput, FieldLabel, type FieldProps } from "./TextField";
import field from "./TextField.module.css";
import s from "./SearchField.module.css";

/**
 * A labelled search input, like TextField, with a clear button while it has text. Escape clears it
 * too. The clear button keeps focus (and the phone keyboard) on the field.
 */
export function SearchField({
  label,
  hideLabel,
  placeholder,
  className,
  inputProps,
  ...props
}: Omit<SearchFieldProps, "className" | "children"> & FieldProps) {
  return (
    <AriaSearchField {...props} className={`${field.field} ${s.field} ${className ?? ""}`}>
      <FieldLabel hidden={hideLabel}>{label}</FieldLabel>
      <div className={s.box}>
        <FieldInput inputProps={inputProps} placeholder={placeholder} className={s.input} />
        <AriaButton className={s.clear}>
          <X size={18} aria-hidden />
        </AriaButton>
      </div>
    </AriaSearchField>
  );
}
