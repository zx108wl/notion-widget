import { useEffect, useMemo, useState } from "react";
import { Button, Layout, Segmented, Spin, Typography } from "antd";
import { AppstoreOutlined, DesktopOutlined, LeftOutlined, MoonOutlined, SunOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import { WidgetCatalog } from "./components/WidgetCatalog.js";
import { ConfigForm } from "./components/ConfigForm.js";
import { PreviewPanel } from "./components/PreviewPanel.js";
import {
  loadManifest,
  loadDefinition,
  type WidgetMeta,
} from "../core/loader.js";
import type { Field } from "../core/schema/field.schema.js";
import type { ThemeMode } from "./useTheme.js";

const { Header, Sider, Content } = Layout;

const THEME_OPTIONS = [
  { label: "跟随系统", value: "auto", icon: <DesktopOutlined /> },
  { label: "浅色", value: "light", icon: <SunOutlined /> },
  { label: "深色", value: "dark", icon: <MoonOutlined /> },
];

export function App({
  themeMode,
  onThemeModeChange,
}: {
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
}) {
  const [widgets, setWidgets] = useState<WidgetMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingFields, setLoadingFields] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // 加载清单
  useEffect(() => {
    loadManifest()
      .then((catalog) => {
        const list = Object.values(catalog);
        setWidgets(list);
        const params = new URLSearchParams(window.location.search).get("widget");
        const initial = params && catalog[params] ? params : list[0]?.id || null;
        setSelectedId(initial);
        (window as unknown as { __widgetCatalog: Record<string, WidgetMeta> }).__widgetCatalog = catalog;
        (window as unknown as { __widgetGetDefinition: (w: unknown, id: string, signal?: AbortSignal) => ReturnType<typeof loadDefinition> }).__widgetGetDefinition = (
          _w,
          id,
          signal,
        ) => loadDefinition(catalog, id, signal);
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => setLoading(false));
  }, []);

  // 加载选中 widget 的字段定义
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    setLoadingFields(true);
    setFields([]);

    loadManifest().then(async (catalog) => {
      try {
        const { fields: resolvedFields } = await loadDefinition(catalog, selectedId, controller.signal);
        if (controller.signal.aborted) return;
        setFields(resolvedFields);
        const draft = drafts[selectedId];
        const initialValues = draft || Object.fromEntries(resolvedFields.map((f) => [f.key, f.default]));
        setValues(initialValues);
        if (!draft) setDrafts((d) => ({ ...d, [selectedId]: initialValues }));
        history.replaceState(null, "", `/?widget=${encodeURIComponent(selectedId)}`);
      } catch (error) {
        if (!controller.signal.aborted) console.error(error);
      } finally {
        if (!controller.signal.aborted) setLoadingFields(false);
      }
    });

    return () => controller.abort();
  }, [selectedId]);

  const handleValuesChange = (next: Record<string, string>) => {
    setValues(next);
    if (selectedId) setDrafts((d) => ({ ...d, [selectedId]: next }));
  };

  const selectedWidget = useMemo(
    () => widgets.find((w) => w.id === selectedId) || null,
    [widgets, selectedId],
  );

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Layout style={{ height: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--bg-page)", borderBottom: "1px solid var(--border-color)" }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <span style={{ background: "var(--accent)", color: "#fff", padding: "4px 10px", borderRadius: 8, marginRight: 10 }}>W</span>
          Notion 小组件
        </Typography.Title>
        <Typography.Text type="secondary" style={{ flex: 1 }}>选择组件，生成可嵌入的专属 URL</Typography.Text>
        <Segmented options={THEME_OPTIONS} value={themeMode} onChange={(v) => onThemeModeChange(v as ThemeMode)} />
      </Header>
      <Layout style={{ overflow: "hidden" }}>
        <Sider
          width={260}
          collapsible
          collapsed={leftCollapsed}
          onCollapse={setLeftCollapsed}
          trigger={null}
          collapsedWidth={64}
          style={{ background: "var(--bg-sider)", borderRight: "1px solid var(--border-color)", overflowY: "auto" }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: leftCollapsed ? "column" : "row",
              alignItems: "center",
              gap: 4,
              justifyContent: leftCollapsed ? "center" : "space-between",
              padding: leftCollapsed ? "12px 8px" : "20px 12px 12px",
            }}
          >
            {leftCollapsed ? (
              <Tooltip title="展开组件库" placement="right">
                <Button
                  type="text"
                  icon={<AppstoreOutlined style={{ color: "var(--accent)" }} />}
                  onClick={() => setLeftCollapsed(false)}
                />
              </Tooltip>
            ) : (
              <>
                <Typography.Text type="secondary" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  组件库
                </Typography.Text>
                <Button
                  type="text"
                  size="small"
                  icon={<LeftOutlined />}
                  onClick={() => setLeftCollapsed(true)}
                />
              </>
            )}
          </div>
          <WidgetCatalog widgets={widgets} selectedId={selectedId} onSelect={setSelectedId} collapsed={leftCollapsed} />
        </Sider>
        <Content style={{ padding: 24, overflow: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {selectedWidget?.name || "选择组件"}
                </Typography.Title>
                {selectedWidget && (
                  <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>
                    {selectedWidget.description}
                  </Typography.Paragraph>
                )}
              </div>
              {selectedWidget && (
                <Typography.Text code>/widget/{selectedWidget.id}</Typography.Text>
              )}
            </div>
            <div style={{ flex: 1, minHeight: 0, background: "var(--bg-page)", borderRadius: 18, padding: 20, border: "1px solid var(--border-color)" }}>
              <PreviewPanel widgetId={selectedId} fields={fields} values={values} />
            </div>
          </div>
        </Content>
        <Sider
          width={400}
          collapsible
          collapsed={rightCollapsed}
          onCollapse={setRightCollapsed}
          trigger={null}
          collapsedWidth={28}
          style={{ background: "var(--bg-sider)", borderLeft: "1px solid var(--border-color)", overflow: "hidden", position: "relative" }}
        >
          <div
            style={{
              display: "flex",
              height: "100%",
              justifyContent: rightCollapsed ? "center" : "flex-start",
            }}
          >
            {/* 选项卡状态栏：整条竖栏，浅紫底色 */}
            <div className={"side-bar" + (rightCollapsed ? " collapsed" : "")}>
              <div className="side-tab" onClick={() => setRightCollapsed(!rightCollapsed)}>
                <span className="side-tab-text">配置面板</span>
              </div>
            </div>
            {/* 面板内容区 */}
            {!rightCollapsed && (
              <div className="side-box">
                {loadingFields ? (
                  <Spin style={{ marginTop: 24 }} />
                ) : (
                  <ConfigForm
                    fields={fields}
                    values={values}
                    onChange={handleValuesChange}
                    widgetBase={
                      selectedWidget
                        ? new URL(".", new URL(selectedWidget.config, window.location.origin)).href
                        : undefined
                    }
                  />
                )}
              </div>
            )}
          </div>
        </Sider>
      </Layout>
    </Layout>
  );
}
