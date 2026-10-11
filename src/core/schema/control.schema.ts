import { z } from "zod";

export const controlTypeSchema = z.enum([
  "input",
  "slider",
  "select",
  "radio",
  "switch",
  "custom",
]);
export type ControlType = z.infer<typeof controlTypeSchema>;

const localJsPath = /^\.\/[a-zA-Z0-9_./-]+\.(js|ts|tsx)$/;
const localCssPath = /^\.\/[a-zA-Z0-9_./-]+\.css$/;
const exportNameRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

function isValidLocalPath(value: string): boolean {
  const parts = value.slice(2).split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..");
}

export const controlSchema = z
  .object({
    type: controlTypeSchema,
    unit: z.string().optional(),
    showInput: z.boolean().optional(),
    entry: z.string().optional(),
    css: z.array(z.string()).optional(),
    export: z.string().optional(),
    props: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((control, ctx) => {
    if (control.type === "slider") {
      // min/max 必须存在且有限且不相等（由 field 层校验，这里只标记字段存在性）
    }
    if (control.entry !== undefined) {
      if (!localJsPath.test(control.entry) || !isValidLocalPath(control.entry)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "自定义控件 entry 必须是插件目录内的相对 .js 路径",
          path: ["entry"],
        });
      }
    }
    if (control.css !== undefined) {
      control.css.forEach((value, index) => {
        if (!localCssPath.test(value) || !isValidLocalPath(value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "自定义控件 css 必须是相对 .css 路径",
            path: ["css", index],
          });
        }
      });
    }
    if (control.export !== undefined && !exportNameRegex.test(control.export)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "控件导出名格式不正确",
        path: ["export"],
      });
    }
  });
export type Control = z.infer<typeof controlSchema>;

// control 与 field.type 的兼容性映射
export const controlCompatibility: Record<string, string[]> = {
  input: ["text", "number", "color", "datetime-local"],
  slider: ["number"],
  select: ["select"],
  radio: ["select"],
  switch: ["checkbox"],
  custom: ["text", "number", "select", "checkbox", "color", "datetime-local"],
};
