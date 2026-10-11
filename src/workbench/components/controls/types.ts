import type { Field } from "../../../core/schema/field.schema.js";
import type { Control } from "../../../core/schema/control.schema.js";

export interface ControlProps {
  field: Field;
  value: string;
  onChange: (value: string) => void;
  widgetBase?: string;
}

export function defaultControlType(field: Field): NonNullable<Control["type"]> {
  if (field.type === "select") return "select";
  if (field.type === "checkbox") return "switch";
  return "input";
}
