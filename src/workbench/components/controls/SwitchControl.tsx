import { Switch } from "antd";
import type { ControlProps } from "./types.js";

export function SwitchControl({ field, value, onChange }: ControlProps) {
  return (
    <Switch
      checked={value === "1"}
      onChange={(checked) => onChange(checked ? "1" : "0")}
      aria-label={field.label}
    />
  );
}
