import { Form } from "antd";
import type { Field } from "../../core/schema/field.schema.js";
import { validateValue } from "../../core/validation/index.js";
import { ControlRenderer } from "./controls/ControlRenderer.js";

interface ConfigFormProps {
  fields: Field[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  widgetBase?: string;
}

// 受控表单：App 层集中管理 values（用于 postMessage 预览与 draft 缓存）
// Form.Item 不用 name（避免 antd cloneElement 注入与控件自定义 onChange(string) 签名冲突），
// 仅用其 label / validateStatus / help 提供标准校验展示
export function ConfigForm({ fields, values, onChange, widgetBase }: ConfigFormProps) {
  const handleChange = (key: string, value: string) => {
    onChange({ ...values, [key]: value });
  };

  return (
    <Form layout="vertical">
      {fields.map((field) => {
        const error = validateValue(field, values[field.key]);
        return (
          <Form.Item
            key={field.key}
            label={field.label}
            htmlFor={`field-${field.key}`}
            validateStatus={error ? "error" : undefined}
            help={error ? `${error.reason}。${error.suggestion}` : field.description}
          >
            <ControlRenderer
              field={field}
              value={values[field.key] ?? field.default}
              onChange={(v) => handleChange(field.key, v)}
              widgetBase={widgetBase}
            />
          </Form.Item>
        );
      })}
    </Form>
  );
}
