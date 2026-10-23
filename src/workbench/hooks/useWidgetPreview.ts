import { useEffect, useRef, useState } from "react";
import type { Field } from "../../core/schema/field.schema.js";
import { validateValues } from "../../core/validation/index.js";
import type { ResolvedTheme } from "../useTheme.js";
import { buildWidgetUrl } from "../widget-url.js";

export interface PreviewState {
  url: string;
  message: string;
  messageType: "warning" | "success" | "";
  iframeRef: React.RefObject<HTMLIFrameElement>;
}

// 仅替换推送给预览的 payload：widget 的 theme 为 auto/缺省时，
// 预览中解析为工作台当前主题；不影响生成的嵌入 URL（auto 仍保持 auto，嵌入 Notion 后跟随系统）
function toPreviewValues(
  values: Record<string, string>,
  hasThemeField: boolean,
  resolvedTheme: ResolvedTheme,
): Record<string, string> {
  if (!hasThemeField) return values;
  const theme = values.theme;
  if (theme && theme !== "auto") return values;
  return { ...values, theme: resolvedTheme };
}

// 封装预览 iframe 的 URL 生成 + postMessage 热更新通信 + widget-ready 握手
// 消除原 PreviewPanel 中 URL 生成 effect 与 message 监听 effect 里重复发送 postMessage 的代码
export function useWidgetPreview(
  widgetId: string | null,
  fields: Field[],
  values: Record<string, string>,
  resolvedTheme: ResolvedTheme,
): PreviewState {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewIdRef = useRef<string | null>(null);
  const readyIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"" | "warning" | "success">("");

  const hasThemeField = fields.some((f) => f.key === "theme");

  // 切换 widget 时重置握手状态
  useEffect(() => {
    previewIdRef.current = null;
    readyIdRef.current = null;
    if (iframeRef.current) iframeRef.current.src = "about:blank";
  }, [widgetId]);

  // 生成 URL + 防抖推送配置
  useEffect(() => {
    if (!widgetId || !fields.length) return;

    const errors = validateValues(fields, values);
    if (errors.length) {
      setUrl("");
      setMessage("请修正参数后再更新预览。");
      setMessageType("warning");
      return;
    }

    const generatedUrl = buildWidgetUrl(widgetId, fields, values);
    setUrl(generatedUrl);
    setMessage("");
    setMessageType("");

    const snapshot = toPreviewValues({ ...values }, hasThemeField, resolvedTheme);
    const id = widgetId;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      if (previewIdRef.current === id && readyIdRef.current === id) {
        iframe.contentWindow?.postMessage(
          { type: "widget-config", id, values: snapshot },
          window.location.origin,
        );
      } else if (previewIdRef.current !== id) {
        previewIdRef.current = id;
        iframe.src = generatedUrl;
      }
    }, 250);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [widgetId, fields, values, resolvedTheme, hasThemeField]);

  // 监听 widget-ready 握手，收到后推送当前配置
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== iframeRef.current?.contentWindow ||
        event.data?.type !== "widget-ready" ||
        event.data.id !== widgetId
      ) {
        return;
      }
      readyIdRef.current = event.data.id;
      const errors = validateValues(fields, values);
      if (!errors.length) {
        iframeRef.current?.contentWindow?.postMessage(
          {
            type: "widget-config",
            id: widgetId,
            values: toPreviewValues(values, hasThemeField, resolvedTheme),
          },
          window.location.origin,
        );
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [widgetId, fields, values, resolvedTheme, hasThemeField]);

  return { url, message, messageType, iframeRef };
}
