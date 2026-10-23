import { Input, InputNumber, ColorPicker, DatePicker } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import type { ControlProps } from "./types.js";

export function InputControl({ field, value, onChange }: ControlProps) {
  if (field.type === "number") {
    return (
      <InputNumber
        style={{ width: "100%" }}
        value={value === "" ? null : Number(value)}
        min={field.min}
        max={field.max}
        step={field.step}
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

  // text（显式守卫后 TS 可收窄到 TextField，访问 maxLength）
  if (field.type === "text") {
    return (
      <Input
        value={value}
        placeholder={field.placeholder}
        maxLength={field.maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // 其余类型（select/checkbox）不应进入 input 控件，回退为普通输入框
  return <Input value={value} onChange={(e) => onChange(e.target.value)} />;
}
