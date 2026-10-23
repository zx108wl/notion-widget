import { Radio } from "antd";
import type { ControlProps } from "./types.js";

export function RadioControl({ field, value, onChange }: ControlProps) {
  // radio 控件仅兼容 select 字段
  if (field.type !== "select") return null;
  return (
    <Radio.Group value={value} onChange={(e) => onChange(e.target.value)}>
      {field.options.map((opt) => (
        <Radio key={opt.value} value={opt.value}>
          {opt.label}
        </Radio>
      ))}
    </Radio.Group>
  );
}
