import { Input } from "antd";
import type { ControlProps } from "../../../src/workbench/components/controls/types.js";

export default function TitleInput({ field, value, onChange }: ControlProps) {
  const maxLength = (field as { maxLength?: number }).maxLength ?? 120;
  return (
    <Input
      value={value}
      maxLength={maxLength}
      placeholder={field.placeholder || "填写事件名称"}
      suffix={`${value.length} / ${maxLength}`}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
