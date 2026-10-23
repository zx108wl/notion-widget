import { useEffect, useRef, useState } from "react";
import type { Field } from "../../core/schema/field.schema.js";
import { useWidgetCatalog } from "./useWidgetCatalog.js";

export interface WidgetDefinitionState {
  fields: Field[];
  values: Record<string, string>;
  loading: boolean;
  setValues: (next: Record<string, string>) => void;
}

// 加载选中 widget 的字段定义 + 管理 drafts 缓存
// 替代原 App.tsx 中 drafts 闭包过期（useEffect 依赖缺失）的问题
export function useWidgetDefinition(selectedId: string | null): WidgetDefinitionState {
  const { loadDefinition } = useWidgetCatalog();
  const [fields, setFields] = useState<Field[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const drafts = useRef<Record<string, Record<string, string>>>({});

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    setLoading(true);
    setFields([]);

    loadDefinition(selectedId, controller.signal)
      .then(({ fields: resolvedFields }) => {
        if (controller.signal.aborted) return;
        setFields(resolvedFields);
        const draft = drafts.current[selectedId];
        const initial = draft ?? Object.fromEntries(resolvedFields.map((f) => [f.key, f.default]));
        setValues(initial);
        if (!draft) drafts.current[selectedId] = initial;
        const params = new URLSearchParams(window.location.search);
        params.set("widget", selectedId);
        history.replaceState(null, "", `/?${params.toString()}`);
      })
      .catch((err) => {
        if (!controller.signal.aborted) console.error(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [selectedId, loadDefinition]);

  const updateValues = (next: Record<string, string>) => {
    setValues(next);
    if (selectedId) drafts.current[selectedId] = next;
  };

  return { fields, values, loading, setValues: updateValues };
}
