import type { FieldWithControl, WidgetConfig } from "./widget-config.schema.js";

// 插件配置的运行时工具：不依赖 zod，供嵌入页与工作台共用。
// zod 全量校验只保留在构建侧与工作台侧（widget-config.schema.ts），
// 嵌入页仅做一次结构性断言，避免把一个 schema 库拖进零框架的嵌入 bundle。

// 插件配置的固定访问路径：清单生成、嵌入页预取都以它为准，避免路径约定散落多处
export function widgetConfigUrl(widgetId: string): string {
  return `/widgets/${widgetId}/config.json`;
}

// 解析字段默认值：datetime-local 的相对日期需要按当前时间求值
export function resolveFields(
  config: Pick<WidgetConfig, "fields">,
  now: Date = new Date(),
): FieldWithControl[] {
  return config.fields.map((field) => {
    if (field.type !== "datetime-local") return { ...field };
    const dv = field.defaultValue;
    if (!dv) return { ...field };
    const date = new Date(now);
    date.setDate(date.getDate() + dv.days);
    date.setSeconds(0, 0);
    const value = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    return { ...field, default: value };
  });
}

export function widgetMetadata(config: WidgetConfig, configUrl: string) {
  const { id, name, icon, summary, description, version, defaultSize } = config;
  let resolvedIcon = icon;
  if (
    typeof icon === "object" &&
    icon.type === "image" &&
    /^\.\/[a-zA-Z0-9_./-]+$/.test(icon.src)
  ) {
    resolvedIcon = {
      ...icon,
      src: new URL(icon.src, new URL(configUrl, "https://widget.invalid")).pathname,
    };
  }
  return { id, name, icon: resolvedIcon, summary, description, version, ...(defaultSize ? { defaultSize } : {}) };
}

// 嵌入页的轻量结构断言：完整字段约束已由构建期 zod 校验覆盖，
// 运行时只确认拿到的是对应插件的合法配置，防止损坏的配置进入渲染流程
export function assertWidgetConfig(config: unknown, widgetId: string): asserts config is WidgetConfig {
  const candidate = config as Partial<WidgetConfig> | null;
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    candidate.schemaVersion !== 1 ||
    candidate.id !== widgetId ||
    !Array.isArray(candidate.fields)
  ) {
    throw new Error(`配置无效: ${widgetId}`);
  }
}
