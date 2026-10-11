import { useEffect, useRef, useState } from "react";
import { Button, Input, Modal, Popconfirm, Space, Tooltip, Typography } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { Field } from "../../core/schema/field.schema.js";
import { validateValues } from "../../core/validation/index.js";

interface PreviewPanelProps {
  widgetId: string | null;
  fields: Field[];
  values: Record<string, string>;
}

interface Preset {
  label: string;
  width: number;
  height: number;
}

const STORAGE_KEY = "notion-widget:view-presets";

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePresets(presets: Preset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

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
  const [presets, setPresets] = useState<Preset[]>(() => loadPresets());
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const dragRef = useRef<{ handle: "e" | "s" | "se"; startX: number; startY: number; startW: number; startH: number } | null>(null);

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

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const next = [...presets, { label: name, width: viewWidth, height: viewHeight }];
    setPresets(next);
    savePresets(next);
    setPresetName("");
    setSaveModalOpen(false);
  };

  const handleDeletePreset = (label: string) => {
    const next = presets.filter((p) => p.label !== label);
    setPresets(next);
    savePresets(next);
  };

  // 拖拽调整视口尺寸
  const startDrag = (handle: "e" | "s" | "se") => (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { handle, startX: e.clientX, startY: e.clientY, startW: viewWidth, startH: viewHeight };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const scale = fitScale || 1;
      const dx = (e.clientX - drag.startX) / scale;
      const dy = (e.clientY - drag.startY) / scale;
      if (drag.handle === "e" || drag.handle === "se") {
        setViewWidth(Math.max(1, Math.round(drag.startW + dx)));
      }
      if (drag.handle === "s" || drag.handle === "se") {
        setViewHeight(Math.max(1, Math.round(drag.startH + dy)));
      }
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [fitScale]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>实时预览</Typography.Title>
        </div>
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
        {presets.map((p) => (
          <Tooltip key={p.label} title={`${p.width} × ${p.height} px`}>
            <span style={{ display: "inline-flex", alignItems: "center" }}>
              <Button
                size="small"
                type={viewWidth === p.width && viewHeight === p.height ? "primary" : "default"}
                onClick={() => applyPreset(p.width, p.height)}
                style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
              >
                {p.label}
              </Button>
              <Popconfirm title="删除该预设？" onConfirm={() => handleDeletePreset(p.label)} okText="删除" cancelText="取消">
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, marginLeft: -1 }}
                />
              </Popconfirm>
            </span>
          </Tooltip>
        ))}
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setSaveModalOpen(true)}>
          保存预设
        </Button>
      </div>

      <Modal
        title="保存视口预设"
        open={saveModalOpen}
        onOk={handleSavePreset}
        onCancel={() => { setSaveModalOpen(false); setPresetName(""); }}
        okText="保存"
        cancelText="取消"
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          将当前尺寸 <Typography.Text code>{viewWidth} × {viewHeight}</Typography.Text> 保存为预设
        </Typography.Paragraph>
        <Input
          placeholder="输入预设名称"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          onPressEnter={handleSavePreset}
          autoFocus
        />
      </Modal>

      {/* 预览舞台：灰色背景，居中显示设备视口 */}
      <div
        ref={stageRef}
        style={{
          position: "relative",
          flex: 1,
          minHeight: 280,
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
            position: "relative",
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
              pointerEvents: "none",
            }}
          />
          {/* 拖拽手柄：右边 */}
          <div
            onMouseDown={startDrag("e")}
            style={{
              position: "absolute",
              top: 0,
              right: -4,
              width: 8,
              height: "100%",
              cursor: "ew-resize",
              zIndex: 10,
            }}
          />
          {/* 拖拽手柄：下边 */}
          <div
            onMouseDown={startDrag("s")}
            style={{
              position: "absolute",
              left: 0,
              bottom: -4,
              width: "100%",
              height: 8,
              cursor: "ns-resize",
              zIndex: 10,
            }}
          />
          {/* 拖拽手柄：右下角 */}
          <div
            onMouseDown={startDrag("se")}
            style={{
              position: "absolute",
              right: -5,
              bottom: -5,
              width: 14,
              height: 14,
              cursor: "nwse-resize",
              zIndex: 11,
              background: "linear-gradient(135deg, transparent 50%, var(--accent) 50%)",
              borderRadius: "0 0 8px 0",
            }}
          />
        </div>
      </div>

      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
        视口尺寸决定组件渲染宽高，可拖拽框架边缘或右下角调整；预览会自动缩放适配区域
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
