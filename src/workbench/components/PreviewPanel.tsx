import { useEffect, useRef, useState } from "react";
import { Button, Input, Space, Typography } from "antd";
import type { Field } from "../../core/schema/field.schema.js";
import { validateValues } from "../../core/validation/index.js";

interface PreviewPanelProps {
  widgetId: string | null;
  fields: Field[];
  values: Record<string, string>;
}

export function PreviewPanel({ widgetId, fields, values }: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState("");
  const [copyText, setCopyText] = useState("");
  const previewIdRef = useRef<string | null>(null);
  const readyIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 生成 URL 并更新预览
  useEffect(() => {
    if (!widgetId || !fields.length) return;

    const errors = validateValues(fields, values);
    if (errors.length) {
      setUrl("");
      setCopyText("请修正参数后再更新预览。");
      return;
    }

    const params = new URLSearchParams();
    fields.forEach((field) => {
      if (values[field.key] !== field.default || (field as { defaultValue?: unknown }).defaultValue) {
        params.set(field.key, values[field.key]);
      }
    });
    const query = params.toString();
    const generatedUrl = `${window.location.origin}/widget/${widgetId}${query ? `?${query}` : ""}`;
    setUrl(generatedUrl);
    setCopyText("");

    const snapshot = { ...values };
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
  }, [widgetId, fields, values]);

  // 监听 widget-ready 消息
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
          { type: "widget-config", id: widgetId, values },
          window.location.origin,
        );
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [widgetId, fields, values]);

  // 切换 widget 时重置 iframe
  useEffect(() => {
    previewIdRef.current = null;
    readyIdRef.current = null;
    if (iframeRef.current) iframeRef.current.src = "about:blank";
  }, [widgetId]);

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyText("已复制，可粘贴到 Notion 的 /embed 中。");
    } catch {
      setCopyText("请使用 Ctrl+C 复制。");
    }
  };

  const handleOpen = () => {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>实时预览</Typography.Title>
        <Button onClick={handleOpen} disabled={!url}>新窗口打开</Button>
      </div>
      <div
        style={{
          position: "relative",
          minWidth: 280,
          minHeight: 160,
          maxWidth: "100%",
          overflow: "auto",
          border: "1px solid #d9d9d9",
          borderRadius: 14,
          background: "#f5f5f5",
          resize: "both",
        }}
      >
        <iframe
          ref={iframeRef}
          title="组件实时预览"
          style={{ width: "100%", height: "100%", border: 0, minHeight: 300, background: "transparent" }}
        />
      </div>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
        拖动预览框右下角可调整显示区域，不会改变组件尺寸
      </Typography.Paragraph>
      <div style={{ marginTop: 16 }}>
        <Typography.Text strong>嵌入 URL</Typography.Text>
        <Space.Compact style={{ width: "100%", marginTop: 8 }}>
          <Input value={url} readOnly />
          <Button type="primary" onClick={handleCopy} disabled={!url}>复制 URL</Button>
        </Space.Compact>
        {copyText && (
          <Typography.Text type={copyText.includes("修正") ? "warning" : "success"} style={{ fontSize: 12 }}>
            {copyText}
          </Typography.Text>
        )}
      </div>
    </div>
  );
}
