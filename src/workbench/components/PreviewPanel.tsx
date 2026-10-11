import { useEffect, useRef, useState } from "react";
import { Button, Input, Space, Typography } from "antd";
import type { Field } from "../../core/schema/field.schema.js";
import { validateValues } from "../../core/validation/index.js";

interface PreviewPanelProps {
  widgetId: string | null;
  fields: Field[];
  values: Record<string, string>;
}

const PRESETS = [
  { label: "手机", width: 375, height: 667 },
  { label: "平板", width: 768, height: 1024 },
  { label: "桌面", width: 1280, height: 800 },
  { label: "宽屏", width: 1920, height: 1080 },
];

export function PreviewPanel({ widgetId, fields, values }: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState("");
  const [copyText, setCopyText] = useState("");
  const previewIdRef = useRef<string | null>(null);
  const readyIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [viewWidth, setViewWidth] = useState(375);
  const [viewHeight, setViewHeight] = useState(300);
  const [fitScale, setFitScale] = useState(1);

  // 计算缩放比例，让视口适配预览区域
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => {
      const pad = 40;
      const availW = stage.clientWidth - pad;
      const availH = stage.clientHeight - pad;
      const scale = Math.min(availW / viewWidth, availH / viewHeight, 1);
      setFitScale(scale > 0 ? scale : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [viewWidth, viewHeight]);

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

  const applyPreset = (w: number, h: number) => {
    setViewWidth(w);
    setViewHeight(h);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>实时预览</Typography.Title>
        <Button onClick={handleOpen} disabled={!url}>新窗口打开</Button>
      </div>

      {/* 设备尺寸工具栏 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          padding: "10px 12px",
          background: "#fafafa",
          border: "1px solid #f0f0f0",
          borderRadius: 10,
          flexWrap: "wrap",
        }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>视口尺寸</Typography.Text>
        <Space.Compact size="small">
          <Input
            value={viewWidth}
            type="number"
            min={1}
            style={{ width: 72, textAlign: "center" }}
            onChange={(e) => setViewWidth(Math.max(1, Number(e.target.value) || 1))}
          />
          <Input
            value="×"
            disabled
            style={{ width: 32, textAlign: "center", paddingInline: 0 }}
          />
          <Input
            value={viewHeight}
            type="number"
            min={1}
            style={{ width: 72, textAlign: "center" }}
            onChange={(e) => setViewHeight(Math.max(1, Number(e.target.value) || 1))}
          />
        </Space.Compact>
        <span style={{ fontSize: 12, color: "#bfbfbf" }}>px</span>
        <div style={{ flex: 1 }} />
        {PRESETS.map((p) => (
          <Button
            key={p.label}
            size="small"
            type={viewWidth === p.width && viewHeight === p.height ? "primary" : "default"}
            onClick={() => applyPreset(p.width, p.height)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* 预览舞台：灰色背景，居中显示设备视口 */}
      <div
        ref={stageRef}
        style={{
          position: "relative",
          minHeight: 420,
          maxHeight: "70vh",
          overflow: "auto",
          background: "linear-gradient(135deg, #f0f0f0 25%, #e8e8e8 25%, #e8e8e8 50%, #f0f0f0 50%, #f0f0f0 75%, #e8e8e8 75%)",
          backgroundSize: "20px 20px",
          border: "1px solid #d9d9d9",
          borderRadius: 14,
          padding: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: viewWidth * fitScale,
            height: viewHeight * fitScale,
            boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
            borderRadius: 8,
            overflow: "hidden",
            background: "#fff",
          }}
        >
          <iframe
            ref={iframeRef}
            title="组件实时预览"
            style={{
              width: viewWidth,
              height: viewHeight,
              border: 0,
              background: "transparent",
              transform: `scale(${fitScale})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      </div>

      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
        视口尺寸决定组件的渲染宽高，预览会自动缩放以适配区域（实际组件尺寸不变）
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
