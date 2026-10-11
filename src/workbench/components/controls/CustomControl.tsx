import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import type { ControlProps } from "./types.js";

interface CustomControlModule {
  default?: ComponentType<ControlProps>;
}

export function CustomControl({ field, value, onChange }: ControlProps) {
  const [Component, setComponent] = useState<ComponentType<ControlProps> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const control = field.control as { entry: string } | undefined;
    if (!control?.entry) return;

    import(/* @vite-ignore */ control.entry)
      .then((mod: CustomControlModule) => {
        if (cancelled) return;
        if (mod.default) {
          setComponent(() => mod.default!);
        } else {
          setError("自定义控件未导出默认组件");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(`自定义控件加载失败：${(err as Error).message}`);
      });

    return () => {
      cancelled = true;
    };
  }, [field]);

  if (error) return <span style={{ color: "#9b6500", fontSize: 12 }}>{error}</span>;
  if (!Component) return null;
  return <Component field={field} value={value} onChange={onChange} />;
}
