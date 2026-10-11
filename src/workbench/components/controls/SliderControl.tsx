import { Slider, InputNumber } from "antd";
import type { ControlProps } from "./types.js";

export function SliderControl({ field, value, onChange }: ControlProps) {
  const min = (field as { min: number }).min;
  const max = (field as { max: number }).max;
  const step = (field as { step?: number }).step;
  const showInput = (field as { control?: { showInput?: boolean } }).control?.showInput;
  const unit = (field as { control?: { unit?: string } }).control?.unit || "";
  const numValue = value === "" ? min : Number(value);

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
        <InputNumber
          min={min}
          max={max}
          step={step}
          value={numValue}
          addonAfter={unit}
          onChange={(v) => onChange(v === null ? "" : String(v))}
        />
      )}
    </div>
  );
}
