import type { Field } from "../core/schema/field.schema.js";

// 生成嵌入页地址：预览、复制、签发令牌共用同一套参数规则——
// 只写入与默认值不同的字段；datetime-local 有 defaultValue 时固定写入。
// 参数校验由调用方先行完成，这里只负责拼接。
export function buildWidgetUrl(widgetId: string, fields: Field[], values: Record<string, string>): string {
  const params = new URLSearchParams();
  fields.forEach((field) => {
    if (values[field.key] !== field.default || (field.type === "datetime-local" && field.defaultValue)) {
      params.set(field.key, values[field.key]);
    }
  });
  const query = params.toString();
  return `${window.location.origin}/widget/${widgetId}${query ? `?${query}` : ""}`;
}
