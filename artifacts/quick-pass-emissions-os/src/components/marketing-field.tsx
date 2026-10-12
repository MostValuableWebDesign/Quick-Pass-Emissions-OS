import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Field } from "./action-form";

/** Explicit names keep select-option text out of the label's accessible name. */
export function MarketingField({
  label,
  children,
  wide = false,
}: {
  label: string;
  children?: ReactNode;
  wide?: boolean;
}) {
  return (
    <Field label={label} wide={wide}>
      {Children.map(children, (child) => {
        if (
          !isValidElement(child) ||
          typeof child.type !== "string" ||
          !["input", "select", "textarea"].includes(child.type)
        )
          return child;
        const control = child as ReactElement<{ "aria-label"?: string }>;
        return cloneElement(control, { "aria-label": control.props["aria-label"] ?? label });
      })}
    </Field>
  );
}
