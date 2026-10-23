import type { Field } from "../schema/field.schema.js";

export interface ValidationError {
  key: string;
  label: string;
  value: string;
  reason: string;
  suggestion: string;
}

const hexColor = /^#[0-9a-f]{6}$/i;
const numberPattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

export function validateValue(field: Field, raw: unknown): ValidationError | null {
  const value = typeof raw === "string" ? raw : String(raw ?? "");
  const fail = (reason: string, suggestion: string): ValidationError => ({
    key: field.key,
    label: field.label,
    value,
    reason,
    suggestion,
  });

  if (!value.trim()) {
    if (field.required || (field.type === "number" && field.default !== "")) {
      return fail("不能为空", field.default ? `建议填写 ${field.default}` : "请填写有效值");
    }
    if (field.type === "number" || field.type === "datetime-local") return null;
  }

  if (field.type === "number") {
    if (!numberPattern.test(value) || !Number.isFinite(Number(value))) {
      return fail("必须是有效数字", `建议填写 ${field.default || field.min || 0}`);
    }
    const number = Number(value);
    const { min, max, step } = field;
    if ((min !== undefined && number < min) || (max !== undefined && number > max)) {
      return fail("数字超出范围", `请输入 ${min ?? "不限"} ～ ${max ?? "不限"} 的数字`);
    }
    if (step !== undefined) {
      const offset = (number - (min ?? 0)) / step;
      if (Math.abs(offset - Math.round(offset)) > 1e-7 * Math.max(1, Math.abs(offset))) {
        return fail("不符合步长限制", `从 ${min ?? 0} 开始，每次增加 ${step}`);
      }
    }
  }

  if (field.type === "select") {
    if (!field.options.some((option) => option.value === value)) {
      return fail("不在可选项中", `可选值：${field.options.map((o) => o.value).join("、")}`);
    }
  }

  if (field.type === "checkbox") {
    if (!["0", "1"].includes(value)) {
      return fail("开关值无效", "使用 1 表示开启，0 表示关闭");
    }
  }

  if (field.type === "color") {
    if (!hexColor.test(value)) {
      return fail("颜色格式错误", "使用六位十六进制颜色，例如 #6c5ce7");
    }
  }

  if (field.type === "datetime-local" && value) {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    const date = new Date(value);
    if (
      !match ||
      !Number.isFinite(date.getTime()) ||
      [
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        date.getSeconds(),
      ].some((part, i) => part !== Number(match[i + 1] ?? 0))
    ) {
      return fail("日期时间无效", "使用本地时间格式，例如 2026-10-17T12:30");
    }
  }

  if (field.type === "text") {
    const min = field.minLength ?? 0;
    const max = field.maxLength ?? 120;
    if (value.length < min || value.length > max) {
      return fail("文字长度不符合限制", `请输入 ${min} ～ ${max} 个字符`);
    }
    const { pattern, patternMessage } = field;
    if (pattern && !new RegExp(`^(?:${pattern})$`, "u").test(value)) {
      return fail("文字格式不符合要求", patternMessage || `请符合格式：${pattern}`);
    }
  }

  return null;
}

export function validateValues(fields: Field[], values: Record<string, unknown>): ValidationError[] {
  return fields
    .map((field) => validateValue(field, values[field.key]))
    .filter((error): error is ValidationError => error !== null);
}

export function parseParams(
  fields: Field[],
  params: URLSearchParams,
  { unknown = "error" }: { unknown?: "error" | "ignore" } = {},
): { config: Record<string, string>; errors: ValidationError[] } {
  const config: Record<string, string> = Object.fromEntries(
    fields.map((field) => [field.key, params.has(field.key) ? params.get(field.key)! : field.default]),
  );
  const errors = validateValues(fields, config);
  const keys = new Set(fields.map((field) => field.key));
  for (const key of new Set(params.keys())) {
    if (!keys.has(key) && unknown === "error") {
      errors.push({
        key,
        label: key,
        value: params.get(key)!,
        reason: "未定义的参数",
        suggestion: `请移除此参数；可用参数：${[...keys].join("、")}`,
      });
    }
    if (keys.has(key) && params.getAll(key).length > 1) {
      errors.push({
        key,
        label: key,
        value: params.getAll(key).join(", "),
        reason: "参数重复",
        suggestion: "每个参数仅保留一个值",
      });
    }
  }
  return { config, errors };
}
