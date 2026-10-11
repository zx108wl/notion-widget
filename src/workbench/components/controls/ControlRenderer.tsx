import type { ComponentType } from "react";
import type { Field } from "../../../core/schema/field.schema.js";
import type { ControlProps } from "./types.js";
import { defaultControlType } from "./types.js";
import { InputControl } from "./InputControl.js";
import { SelectControl } from "./SelectControl.js";
import { RadioControl } from "./RadioControl.js";
import { SwitchControl } from "./SwitchControl.js";
import { SliderControl } from "./SliderControl.js";
import { CustomControl } from "./CustomControl.js";
import type { ControlType } from "../../../core/schema/control.schema.js";

const controlMap: Record<ControlType, ComponentType<ControlProps>> = {
  input: InputControl,
  select: SelectControl,
  radio: RadioControl,
  switch: SwitchControl,
  slider: SliderControl,
  custom: CustomControl,
};

export function ControlRenderer({ field, value, onChange }: ControlProps) {
  const type = field.control?.type ?? defaultControlType(field);
  const Component = controlMap[type];
  if (!Component) return null;
  return <Component field={field} value={value} onChange={onChange} />;
}

export type { Field };
