import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { Typography } from "antd";
import type { ControlProps } from "./types.js";
import { ControlErrorBoundary } from "./ErrorBoundary.js";

interface CustomControlModule {
  default?: ComponentType<ControlProps>;
}

export function CustomControl({ field, value, onChange, widgetBase }: ControlProps) {
  const [Component, setComponent] = useState<ComponentType<ControlProps> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const control = field.control as { entry?: string } | undefined;
    if (!control?.entry) return;

    const entryUrl = widgetBase ? new URL(control.entry, widgetBase).href : control.entry;

    import(/* @vite-ignore */ entryUrl)
      .then((mod: CustomControlModule) => {
        if (cancelled) return;
        if (mod.default) {
          setComponent(mod.default);
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
  }, [field, widgetBase]);

  if (error) {
    return <Typography.Text type="danger" style={{ fontSize: 12 }}>{error}</Typography.Text>;
  }
  if (!Component) return null;
  return (
    <ControlErrorBoundary>
      <Component field={field} value={value} onChange={onChange} />
    </ControlErrorBoundary>
  );
}
