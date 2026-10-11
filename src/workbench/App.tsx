import { useEffect, useMemo, useState } from "react";
import { Layout, Spin, Typography } from "antd";
import { WidgetCatalog } from "./components/WidgetCatalog.js";
import { ConfigForm } from "./components/ConfigForm.js";
import { PreviewPanel } from "./components/PreviewPanel.js";
import {
  loadManifest,
  loadDefinition,
  type WidgetMeta,
} from "../core/loader.js";
import type { Field } from "../core/schema/field.schema.js";

const { Header, Sider, Content } = Layout;

export function App() {
  const [widgets, setWidgets] = useState<WidgetMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingFields, setLoadingFields] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});

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
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff", borderBottom: "1px solid #f0f0f0" }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <span style={{ background: "#000", color: "#fff", padding: "4px 10px", borderRadius: 8, marginRight: 10 }}>W</span>
          Notion 小组件
        </Typography.Title>
        <Typography.Text type="secondary">选择组件，生成可嵌入的专属 URL</Typography.Text>
      </Header>
      <Layout>
        <Sider width={260} style={{ background: "#fafafa", borderRight: "1px solid #f0f0f0", padding: "20px 12px" }}>
          <Typography.Text type="secondary" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "0 12px" }}>
            组件库
          </Typography.Text>
          <WidgetCatalog widgets={widgets} selectedId={selectedId} onSelect={setSelectedId} />
        </Sider>
        <Content style={{ padding: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 440px) minmax(420px, 1fr)", gap: 24, alignItems: "start" }}>
            <div style={{ background: "#fff", borderRadius: 18, padding: 24, border: "1px solid #f0f0f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    CONFIGURE
                  </Typography.Text>
                  <Typography.Title level={3} style={{ margin: "4px 0 0" }}>
                    {selectedWidget?.name || "选择组件"}
                  </Typography.Title>
                  {selectedWidget && (
                    <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
                      {selectedWidget.description}
                    </Typography.Paragraph>
                  )}
                </div>
                {selectedWidget && (
                  <Typography.Text code>/widget/{selectedWidget.id}</Typography.Text>
                )}
              </div>
              {loadingFields ? (
                <Spin />
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
            <div style={{ background: "#fff", borderRadius: 18, padding: 20, border: "1px solid #f0f0f0", position: "sticky", top: 24 }}>
              <PreviewPanel widgetId={selectedId} fields={fields} values={values} />
            </div>
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
