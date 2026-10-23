import { useEffect, useRef, useState } from "react";
import { Button, Input, InputNumber, Modal, Popconfirm, Space, Tooltip, Typography } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { Field } from "../../core/schema/field.schema.js";
import type { ResolvedTheme } from "../useTheme.js";
import { api } from "../api.js";
import { useWidgetPreview } from "../hooks/useWidgetPreview.js";
import { useViewportPresets } from "../hooks/useViewportPresets.js";

interface PreviewPanelProps {
  widgetId: string | null;
  fields: Field[];
  values: Record<string, string>;
  resolvedTheme: ResolvedTheme;
  defaultSize?: { width: number; height: number };
}

export function PreviewPanel({ widgetId, fields, values, resolvedTheme, defaultSize }: PreviewPanelProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const { url, message, messageType, iframeRef } = useWidgetPreview(widgetId, fields, values, resolvedTheme);
  const { presets, savePreset, deletePreset } = useViewportPresets();

  const [viewWidth, setViewWidth] = useState(defaultSize?.width ?? 375);
  const [viewHeight, setViewHeight] = useState(defaultSize?.height ?? 300);
  const [fitScale, setFitScale] = useState(1);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [copyText, setCopyText] = useState("");
  const [tokenRequired, setTokenRequired] = useState(false);
  const dragRef = useRef<{ handle: "e" | "s" | "se"; startX: number; startY: number; startW: number; startH: number } | null>(null);

  // 需要令牌的插件：嵌入链接由令牌页签发并复制，工作台不再保存/回显令牌明文
  useEffect(() => {
    setTokenRequired(false);
    if (!widgetId) return;
    let cancelled = false;
    api
      .listWidgetMeta()
      .then((meta) => {
        if (!cancelled) setTokenRequired(meta.auth[widgetId] === "token");
      })
      .catch(() => {
        if (!cancelled) setTokenRequired(false);
      });
    return () => {
      cancelled = true;
    };
  }, [widgetId]);

  // 切换插件时按插件配置的默认尺寸初始化视口
  useEffect(() => {
    if (!defaultSize) return;
    setViewWidth(defaultSize.width);
    setViewHeight(defaultSize.height);
  }, [widgetId, defaultSize]);

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

  // 拖拽调整视口尺寸
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
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [fitScale]);

  const handleCopy = async () => {
    if (!url) return;
    if (tokenRequired) {
      setCopyText("该插件需要访问令牌：请在右侧「签发令牌」选项卡签发，并复制生成的完整嵌入链接。");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopyText("已复制，可粘贴到 Notion 的 /embed 中。");
    } catch {
      setCopyText("请使用 Ctrl+C 复制。");
    }
  };

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    savePreset(name, viewWidth, viewHeight);
    setPresetName("");
    setSaveModalOpen(false);
  };

  const startDrag = (handle: "e" | "s" | "se") => (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { handle, startX: e.clientX, startY: e.clientY, startW: viewWidth, startH: viewHeight };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 嵌入 URL：需要令牌的插件在右侧「签发令牌」选项卡签发完整链接 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Typography.Text strong style={{ whiteSpace: "nowrap" }}>嵌入 URL</Typography.Text>
        <Space.Compact style={{ flex: 1 }}>
          <Input value={url} readOnly placeholder="参数校验通过后自动生成" />
          <Button type="primary" onClick={handleCopy} disabled={!url}>复制 URL</Button>
        </Space.Compact>
      </div>
      <div style={{ minHeight: 22, marginBottom: 4 }}>
        {message ? (
          <Typography.Text type={messageType === "warning" ? "warning" : "success"} style={{ fontSize: 12 }}>
            {message}
          </Typography.Text>
        ) : copyText ? (
          <Typography.Text type={tokenRequired ? "warning" : "success"} style={{ fontSize: 12 }}>
            {copyText}
          </Typography.Text>
        ) : tokenRequired ? (
          <Typography.Text type="warning" style={{ fontSize: 12 }}>
            该插件接口需要访问令牌：请在右侧「签发令牌」选项卡签发，并复制生成的完整嵌入链接。
          </Typography.Text>
        ) : null}
      </div>

      {/* 设备尺寸工具栏 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          padding: "10px 12px",
          background: "var(--ant-color-fill-quaternary, #fafafa)",
          border: "1px solid var(--ant-color-border-secondary, #f0f0f0)",
          borderRadius: 10,
          flexWrap: "wrap",
        }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>视口尺寸</Typography.Text>
        <Space.Compact size="small">
          <InputNumber
            value={viewWidth}
            min={1}
            style={{ width: 72 }}
            onChange={(v) => setViewWidth(Math.max(1, v ?? 1))}
          />
          <InputNumber
            value={viewHeight}
            min={1}
            style={{ width: 72 }}
            onChange={(v) => setViewHeight(Math.max(1, v ?? 1))}
          />
        </Space.Compact>
        <span style={{ fontSize: 12, color: "var(--ant-color-text-tertiary, #bfbfbf)" }}>px</span>
        <div style={{ flex: 1 }} />
        {presets.map((p) => (
          <Tooltip key={p.label} title={`${p.width} × ${p.height} px`}>
            <span style={{ display: "inline-flex", alignItems: "center" }}>
              <Button
                size="small"
                type={viewWidth === p.width && viewHeight === p.height ? "primary" : "default"}
                onClick={() => {
                  setViewWidth(p.width);
                  setViewHeight(p.height);
                }}
                style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
              >
                {p.label}
              </Button>
              <Popconfirm title="删除该预设？" onConfirm={() => deletePreset(p.label)} okText="删除" cancelText="取消">
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
        <Button size="small" onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")} disabled={!url}>
          新窗口打开
        </Button>
      </div>

      <Modal
        title="保存视口预设"
        open={saveModalOpen}
        onOk={handleSavePreset}
        onCancel={() => {
          setSaveModalOpen(false);
          setPresetName("");
        }}
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

      {/* 预览舞台：棋盘格背景，居中显示设备视口 */}
      <div
        ref={stageRef}
        className="preview-stage"
        style={{
          position: "relative",
          flex: 1,
          minHeight: 280,
          overflow: "auto",
          border: "1px solid var(--ant-color-border, #d9d9d9)",
          borderRadius: 12,
          padding: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          className="preview-frame"
          style={{
            position: "relative",
            width: viewWidth * fitScale,
            height: viewHeight * fitScale,
            boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
            overflow: "hidden",
            background: "var(--ant-color-bg-container, #fff)",
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
          <Tooltip title="拖拽调整宽度" placement="top">
            <div
              onMouseDown={startDrag("e")}
              style={{ position: "absolute", top: 0, right: -4, width: 8, height: "100%", cursor: "ew-resize", zIndex: 10 }}
            />
          </Tooltip>
          <Tooltip title="拖拽调整高度" placement="right">
            <div
              onMouseDown={startDrag("s")}
              style={{ position: "absolute", left: 0, bottom: -4, width: "100%", height: 8, cursor: "ns-resize", zIndex: 10 }}
            />
          </Tooltip>
          <Tooltip title="拖拽调整尺寸" placement="top">
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
                background: "linear-gradient(135deg, transparent 50%, var(--ant-color-primary, #6c5ce7) 50%)",
              }}
            />
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
