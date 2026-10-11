import { z } from "zod";
import { fieldSchema } from "./field.schema.js";
import { controlCompatibility } from "./control.schema.js";
import { iconSchema } from "./icon.schema.js";

const localJsPath = /^\.\/[a-zA-Z0-9_./-]+\.(js|ts|tsx)$/;
const localCssPath = /^\.\/[a-zA-Z0-9_./-]+\.css$/;

function isValidLocalPath(value: string): boolean {
  const parts = value.slice(2).split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..");
}

const hexColor = /^#[0-9a-f]{6}$/i;

export const fieldWithControlSchema = fieldSchema.superRefine((field, ctx) => {
  const control = field.control;
  if (control) {
    const allowed = controlCompatibility[control.type] || [];
    if (!allowed.includes(field.type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `控件 ${control.type} 不兼容字段类型 ${field.type}`,
        path: ["control", "type"],
      });
    }
    if (control.type === "slider") {
      const f = field as { min?: number; max?: number };
      if (
        f.min === undefined ||
        f.max === undefined ||
        !Number.isFinite(f.min) ||
        !Number.isFinite(f.max) ||
        f.min === f.max
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "slider 控件需要有限且不相等的 min/max",
          path: ["control", "type"],
        });
      }
    }
  }
});
export type FieldWithControl = z.infer<typeof fieldWithControlSchema>;

export const widgetConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string(),
    name: z.string().min(1),
    icon: iconSchema,
    summary: z.string().min(1),
    description: z.string().min(1),
    version: z.string().min(1),
    entry: z.object({
      js: z.string(),
      css: z.array(z.string()),
    }),
    fields: z.array(fieldWithControlSchema),
  })
  .superRefine((config, ctx) => {
    // entry 路径校验
    if (!localJsPath.test(config.entry.js) || !isValidLocalPath(config.entry.js)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "entry.js 必须是相对 .js 路径",
        path: ["entry", "js"],
      });
    }
    config.entry.css.forEach((value, index) => {
      if (!localCssPath.test(value) || !isValidLocalPath(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "entry.css 必须是相对 .css 路径",
          path: ["entry", "css", index],
        });
      }
    });

    // 字段 key 去重
    const keys = new Set<string>();
    config.fields.forEach((field, index) => {
      if (keys.has(field.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `字段 key 重复: ${field.key}`,
          path: ["fields", index, "key"],
        });
      }
      keys.add(field.key);
    });

    // 字段级约束校验
    config.fields.forEach((field, index) => {
      const path = ["fields", index] as const;
      if (field.type === "number") {
        const f = field as { min?: number; max?: number; step?: number };
        if (f.min !== undefined && f.max !== undefined && f.min > f.max) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "min 不能大于 max",
            path: [...path, "min"],
          });
        }
        if (field.default !== "") {
          const n = Number(field.default);
          if (!Number.isFinite(n)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "number 默认值必须是有效数字",
              path: [...path, "default"],
            });
          } else if (
            (f.min !== undefined && n < f.min) ||
            (f.max !== undefined && n > f.max)
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "number 默认值超出范围",
              path: [...path, "default"],
            });
          } else if (f.step !== undefined) {
            const offset = (n - (f.min ?? 0)) / f.step;
            if (Math.abs(offset - Math.round(offset)) > 1e-7 * Math.max(1, Math.abs(offset))) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "number 默认值不符合步长限制",
                path: [...path, "default"],
              });
            }
          }
        }
      }
      if (field.type === "select") {
        const f = field as { options: { value: string; label: string }[] };
        const values = f.options.map((o) => o.value);
        if (new Set(values).size !== values.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "select 选项值不能重复",
            path: [...path, "options"],
          });
        }
        if (!values.includes(field.default)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "select 默认值必须属于 options",
            path: [...path, "default"],
          });
        }
      }
      if (field.type === "checkbox") {
        if (!["0", "1"].includes(field.default)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "checkbox 默认值只能是 0 或 1",
            path: [...path, "default"],
          });
        }
      }
      if (field.type === "color") {
        if (!hexColor.test(field.default)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "color 默认值必须是 #rrggbb 格式",
            path: [...path, "default"],
          });
        }
      }
      if (field.type === "datetime-local") {
        const dv = (field as { defaultValue?: { kind: string; days: number } }).defaultValue;
        if (dv) {
          if (dv.kind !== "relative-date" || !Number.isFinite(dv.days) || Math.abs(dv.days) > 36500) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "动态默认值不合法",
              path: [...path, "defaultValue"],
            });
          }
        }
      }
    });
  });

export type WidgetConfig = z.infer<typeof widgetConfigSchema>;

export function validateConfig(config: unknown, widgetId: string): WidgetConfig {
  const parsed = widgetConfigSchema.parse(config);
  if (parsed.id !== widgetId) {
    throw new Error(`配置 id 不匹配: 期望 ${widgetId}, 实际 ${parsed.id}`);
  }
  return parsed;
}

export function resolveFields(config: WidgetConfig, now: Date = new Date()): FieldWithControl[] {
  return config.fields.map((field) => {
    if (field.type !== "datetime-local") return { ...field };
    const dv = (field as { defaultValue?: { kind: string; days: number } }).defaultValue;
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
  const { id, name, icon, summary, description, version } = config;
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
  return { id, name, icon: resolvedIcon, summary, description, version };
}
