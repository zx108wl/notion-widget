import { Radio } from "antd";
import type { ControlProps } from "./types.js";

export function RadioControl({ field, value, onChange }: ControlProps) {
  const options = (field as { options: { value: string; label: string }[] }).options;
  return (
    <Radio.Group value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((opt) => (
        <Radio key={opt.value} value={opt.value}>
          {opt.label}
        </Radio>
      ))}
    </Radio.Group>
  );
}
