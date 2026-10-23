import { Button, Slider, InputNumber, Space } from "antd";
import type { ControlProps } from "./types.js";

export function SliderControl({ field, value, onChange }: ControlProps) {
  // slider 控件仅兼容 number 字段；类型守卫收窄后 min/max/step 可直接访问
  if (field.type !== "number") return null;

  const { min, max, step, control } = field;
  const showInput = control?.showInput;
  const unit = control?.unit || "";
  const numValue = value === "" ? (min ?? 0) : Number(value);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Slider
        style={{ flex: 1 }}
        min={min}
        max={max}
        step={step}
        value={numValue}
        onChange={(v) => onChange(String(v))}
      />
      {showInput && (
        <Space.Compact>
          <InputNumber
            min={min}
            max={max}
            step={step}
            value={numValue}
            onChange={(v) => onChange(v === null ? "" : String(v))}
          />
          {unit && <Button style={{ pointerEvents: "none" }}>{unit}</Button>}
        </Space.Compact>
      )}
    </div>
  );
}
