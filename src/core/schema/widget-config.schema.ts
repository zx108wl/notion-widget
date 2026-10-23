import { z } from "zod";
import { fieldSchema } from "./field.schema.js";
import { controlCompatibility } from "./control.schema.js";
import { iconSchema } from "./icon.schema.js";
import {
  CREDENTIAL_REF_RE,
  isReservedRoute,
  parseRouteKey,
  widgetServerSchema,
} from "./widget-server.schema.js";

const localJsPath = /^\.\/[a-zA-Z0-9_./-]+\.(js|ts|tsx)$/;
const localCssPath = /^\.\/[a-zA-Z0-9_./-]+\.css$/;

function isValidLocalPath(value: string): boolean {
  const parts = value.slice(2).split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..");
}

const hexColor = /^#[0-9a-f]{6}$/i;

// 工作台预览的默认尺寸：仅用于工作台渲染该插件时初始化视口，不影响嵌入 Notion 后的实际尺寸
const defaultSizeSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

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
    if (control.type === "slider" && field.type === "number") {
      if (
        field.min === undefined ||
        field.max === undefined ||
        !Number.isFinite(field.min) ||
        !Number.isFinite(field.max) ||
        field.min === field.max
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
    // 可选的服务端模块声明：缺省时行为与不声明完全一致（schemaVersion 1 向后兼容）
    server: widgetServerSchema.optional(),
    defaultSize: defaultSizeSchema.optional(),
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

    // 服务端模块声明校验：只登记白名单接口，未声明的一律不暴露
    if (config.server) {
      if (!localJsPath.test(config.server.entry) || !isValidLocalPath(config.server.entry)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "server.entry 必须是相对 .js/.ts 路径",
          path: ["server", "entry"],
        });
      }
      if (config.server.expose.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "server.expose 至少要声明一个接口",
          path: ["server", "expose"],
        });
      }
      const routes = new Set<string>();
      config.server.expose.forEach((key, index) => {
        const parsed = parseRouteKey(key);
        if (!parsed) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `接口声明不合法: ${key}（需形如 "GET /api/xxx"，且为静态路径）`,
            path: ["server", "expose", index],
          });
        } else if (isReservedRoute(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `接口声明与核心保留路由冲突: ${key}`,
            path: ["server", "expose", index],
          });
        }
        if (routes.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `接口声明重复: ${key}`,
            path: ["server", "expose", index],
          });
        }
        routes.add(key);
      });
      const credentials = new Set<string>();
      (config.server.credentials ?? []).forEach((item, index) => {
        const ref = typeof item === "string" ? item : item.ref;
        if (!CREDENTIAL_REF_RE.test(ref)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `凭据声明不合法: ${ref}（需形如 "provider.slot"）`,
            path: ["server", "credentials", index],
          });
        } else if (credentials.has(ref)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `凭据声明重复: ${ref}`,
            path: ["server", "credentials", index],
          });
        }
        credentials.add(ref);
      });
      // 声明凭据的接口必须是 auth: "token"：否则匿名请求也能读到第三方密钥
      if (credentials.size > 0 && config.server.auth !== "token") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '声明了 credentials 的插件必须同时声明 auth: "token"',
          path: ["server", "auth"],
        });
      }
    }

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
        const { min, max, step } = field;
        if (min !== undefined && max !== undefined && min > max) {
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
            (min !== undefined && n < min) ||
            (max !== undefined && n > max)
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "number 默认值超出范围",
              path: [...path, "default"],
            });
          } else if (step !== undefined) {
            const offset = (n - (min ?? 0)) / step;
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
        const values = field.options.map((o) => o.value);
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
        const dv = field.defaultValue;
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
