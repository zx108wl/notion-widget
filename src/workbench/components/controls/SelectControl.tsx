import { Select } from "antd";
import type { ControlProps } from "./types.js";

export function SelectControl({ field, value, onChange }: ControlProps) {
  // select 控件仅兼容 select 字段
  if (field.type !== "select") return null;
  return (
    <Select
      style={{ width: "100%" }}
      value={value}
      options={field.options}
      onChange={(v) => onChange(String(v))}
    />
  );
}
