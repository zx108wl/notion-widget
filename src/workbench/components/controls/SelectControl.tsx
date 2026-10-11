import { Select } from "antd";
import type { ControlProps } from "./types.js";

export function SelectControl({ field, value, onChange }: ControlProps) {
  const options = (field as { options: { value: string; label: string }[] }).options;
  return (
    <Select
      style={{ width: "100%" }}
      value={value}
      options={options}
      onChange={(v) => onChange(String(v))}
    />
  );
}
