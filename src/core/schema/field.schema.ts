import { z } from "zod";
import { controlSchema, controlTypeSchema } from "./control.schema.js";

export const fieldTypeSchema = z.enum([
  "text",
  "number",
  "select",
  "checkbox",
  "color",
  "datetime-local",
]);
export type FieldType = z.infer<typeof fieldTypeSchema>;

export type ControlType = z.infer<typeof controlTypeSchema>;

const keyRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;

const baseField = z.object({
  key: z.string().regex(keyRegex, "字段 key 格式不正确"),
  label: z.string().min(1, "字段 label 不能为空"),
  type: fieldTypeSchema,
  default: z.string(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
  control: controlSchema.optional(),
});

export const textFieldSchema = baseField.extend({
  type: z.literal("text"),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().nonnegative().optional(),
  pattern: z.string().optional(),
  patternMessage: z.string().optional(),
});

export const numberFieldSchema = baseField.extend({
  type: z.literal("number"),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  step: z.number().positive().optional(),
});

export const selectOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

export const selectFieldSchema = baseField.extend({
  type: z.literal("select"),
  options: z.array(selectOptionSchema).min(1),
});

export const checkboxFieldSchema = baseField.extend({
  type: z.literal("checkbox"),
});

export const colorFieldSchema = baseField.extend({
  type: z.literal("color"),
});

export const datetimeFieldSchema = baseField.extend({
  type: z.literal("datetime-local"),
  defaultValue: z
    .object({
      kind: z.literal("relative-date"),
      days: z.number().finite(),
    })
    .optional(),
});

export const fieldSchema = z.discriminatedUnion("type", [
  textFieldSchema,
  numberFieldSchema,
  selectFieldSchema,
  checkboxFieldSchema,
  colorFieldSchema,
  datetimeFieldSchema,
]);
export type Field = z.infer<typeof fieldSchema>;
export type TextField = z.infer<typeof textFieldSchema>;
export type NumberField = z.infer<typeof numberFieldSchema>;
export type SelectField = z.infer<typeof selectFieldSchema>;
export type CheckboxField = z.infer<typeof checkboxFieldSchema>;
export type ColorField = z.infer<typeof colorFieldSchema>;
export type DatetimeField = z.infer<typeof datetimeFieldSchema>;
