import { Input, InputNumber, ColorPicker, DatePicker } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import type { ControlProps } from "./types.js";

export function InputControl({ field, value, onChange }: ControlProps) {
  if (field.type === "number") {
    const min = (field as { min?: number }).min;
    const max = (field as { max?: number }).max;
    const step = (field as { step?: number }).step;
    return (
      <InputNumber
        style={{ width: "100%" }}
        value={value === "" ? null : Number(value)}
        min={min}
        max={max}
        step={step}
        placeholder={field.placeholder}
        onChange={(v) => onChange(v === null ? "" : String(v))}
      />
    );
  }

  if (field.type === "color") {
    return (
      <ColorPicker
        value={value}
        showText
        onChange={(_, hex) => onChange(hex)}
      />
    );
  }

  if (field.type === "datetime-local") {
    return (
      <DatePicker
        showTime
        style={{ width: "100%" }}
        value={value ? dayjs(value) : null}
        onChange={(d: Dayjs | null) => onChange(d ? d.format("YYYY-MM-DDTHH:mm") : "")}
      />
    );
  }

  // text
  const maxLength = (field as { maxLength?: number }).maxLength;
  return (
    <Input
      value={value}
      placeholder={field.placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
