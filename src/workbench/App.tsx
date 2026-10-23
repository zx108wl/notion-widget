import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Layout, Spin, Tooltip, Typography } from "antd";
import { LeftOutlined, RightOutlined, SearchOutlined } from "@ant-design/icons";
import type { InputRef } from "antd";
import { WidgetCatalogContext } from "./context/WidgetCatalogContext.js";
import { useWidgetCatalog } from "./hooks/useWidgetCatalog.js";
import { useWidgetDefinition } from "./hooks/useWidgetDefinition.js";
import { useSession } from "./hooks/useSession.js";
import type { ThemeMode, ResolvedTheme } from "./useTheme.js";
import { AppHeader } from "./components/AppHeader.js";
import { LoginPage } from "./components/LoginPage.js";
import { WidgetCatalog } from "./components/WidgetCatalog.js";
import { ConfigForm } from "./components/ConfigForm.js";
import { PreviewPanel } from "./components/PreviewPanel.js";
import { TokenIssuePanel } from "./components/TokenIssuePanel.js";
import { SettingsPage } from "./components/SettingsPage.js";

const { Header, Sider, Content } = Layout;

type View = "workbench" | "settings";

export function App({
  themeMode,
  resolvedTheme,
  onThemeModeChange,
}: {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  onThemeModeChange: (mode: ThemeMode) => void;
}) {
  const session = useSession();
  const catalogValue = useWidgetCatalog();
  const { widgets, loading, catalog } = catalogValue;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  // 右侧边栏的选项卡：配置面板 / 签发令牌；null 表示整体收起
  const [rightTab, setRightTab] = useState<"config" | "token" | null>("config");
  const rightCollapsed = rightTab === null;
  const [view, setView] = useState<View>("workbench");
  const [focusSignal, setFocusSignal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const inputRef = useRef<InputRef>(null);

  // 单次调用：fields/values/drafts 在 App 层集中管理，避免子组件各自调用导致 drafts 分裂
  const { fields, values, loading: loadingFields, setValues } = useWidgetDefinition(selectedId);

  // 初始化选中项：URL 参数优先，否则取第一个
  useEffect(() => {
    if (selectedId || !widgets.length) return;
    const params = new URLSearchParams(window.location.search).get("widget");
    const initial = params && catalog[params] ? params : widgets[0]?.id ?? null;
    if (initial) setSelectedId(initial);
  }, [widgets, catalog, selectedId]);

  useEffect(() => {
    if (focusSignal > 0) inputRef.current?.focus();
  }, [focusSignal]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return widgets;
    return widgets.filter((w) =>
      [w.name, w.summary ?? "", w.id].some((t) => t.toLowerCase().includes(kw)),
    );
  }, [widgets, keyword]);

  const selectedWidget = useMemo(
    () => widgets.find((w) => w.id === selectedId) ?? null,
    [widgets, selectedId],
  );

  const widgetBase = selectedWidget
    ? new URL(".", new URL(selectedWidget.config, window.location.origin)).href
    : undefined;

  if (session.loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
        <Spin size="large" />
      </div>
    );
  }

  // 工作台是公开的，未登录只看登录页：密钥与令牌的管理接口一律要求有效会话
  if (!session.user) {
    return <LoginPage onLogin={session.login} />;
  }

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (view === "settings") {
    return (
      <WidgetCatalogContext.Provider value={catalogValue}>
        <SettingsPage username={session.user.username} onBack={() => setView("workbench")} />
      </WidgetCatalogContext.Provider>
    );
  }

  return (
    <WidgetCatalogContext.Provider value={catalogValue}>
      <Layout style={{ height: "100vh" }}>
        <Header
          className="app-header"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "0 24px",
            borderBottom: "1px solid var(--ant-color-border-secondary)",
          }}
        >
          <AppHeader
            themeMode={themeMode}
            onThemeModeChange={onThemeModeChange}
            username={session.user.username}
            onLogout={() => void session.logout()}
            onOpenSettings={() => setView("settings")}
          />
        </Header>
        <Layout style={{ overflow: "hidden" }}>
          <Sider
            theme="light"
            width={220}
            collapsible
            collapsed={leftCollapsed}
            onCollapse={setLeftCollapsed}
            trigger={null}
            collapsedWidth={64}
            style={{
              background: "var(--ant-color-fill-quaternary)",
              borderRight: "1px solid var(--ant-color-border-secondary)",
              overflowY: "auto",
            }}
          >
            <div className="sider-title" data-collapsed={leftCollapsed}>
              {!leftCollapsed && (
                <Input
                  ref={inputRef}
                  allowClear
                  size="small"
                  prefix={<SearchOutlined />}
                  placeholder="搜索组件"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  style={{ flex: 1 }}
                />
              )}
              <Tooltip title={leftCollapsed ? "展开组件库" : "收起组件库"} placement="right">
                <Button
                  type="text"
                  className="sider-action-btn"
                  icon={leftCollapsed ? <RightOutlined /> : <LeftOutlined />}
                  onClick={() => setLeftCollapsed(!leftCollapsed)}
                />
              </Tooltip>
            </div>
            <WidgetCatalog
              widgets={filtered}
              selectedId={selectedId}
              onSelect={setSelectedId}
              collapsed={leftCollapsed}
              onSearchClick={() => {
                setLeftCollapsed(false);
                setFocusSignal((s) => s + 1);
              }}
            />
          </Sider>
          <Content style={{ padding: 24, overflow: "auto" }}>
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ marginBottom: 16 }}>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  {selectedWidget?.name ?? "选择组件"}
                </Typography.Title>
                {selectedWidget?.description && (
                  <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>
                    {selectedWidget.description}
                  </Typography.Paragraph>
                )}
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <PreviewPanel
                  widgetId={selectedId}
                  fields={fields}
                  values={values}
                  resolvedTheme={resolvedTheme}
                  defaultSize={selectedWidget?.defaultSize}
                />
              </div>
            </div>
          </Content>
          <Sider
            width={400}
            collapsible
            collapsed={rightCollapsed}
            trigger={null}
            collapsedWidth={36}
            style={{
              background: "var(--ant-color-fill-quaternary)",
              borderLeft: "1px solid var(--ant-color-border-secondary)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                display: "flex",
                height: "100%",
                justifyContent: rightCollapsed ? "center" : "flex-start",
              }}
            >
              <div className="side-bar">
                <Tooltip title={rightTab === "config" ? "收起配置面板" : "打开配置面板"} placement="left">
                  <div
                    className="side-tab"
                    data-active={rightTab === "config"}
                    onClick={() => setRightTab(rightTab === "config" ? null : "config")}
                  >
                    <span className="side-tab-text">配置面板</span>
                  </div>
                </Tooltip>
                <Tooltip title={rightTab === "token" ? "收起签发令牌" : "打开签发令牌"} placement="left">
                  <div
                    className="side-tab"
                    data-active={rightTab === "token"}
                    onClick={() => setRightTab(rightTab === "token" ? null : "token")}
                  >
                    <span className="side-tab-text">签发令牌</span>
                  </div>
                </Tooltip>
              </div>
              {rightTab === "config" && (
                <div className="side-box">
                  {loadingFields ? (
                    <Spin style={{ marginTop: 24 }} />
                  ) : (
                    <ConfigForm
                      fields={fields}
                      values={values}
                      onChange={setValues}
                      widgetBase={widgetBase}
                    />
                  )}
                </div>
              )}
              {rightTab === "token" && (
                <div className="side-box">
                  {selectedId ? (
                    <TokenIssuePanel
                      widgetId={selectedId}
                      widgetName={selectedWidget?.name ?? selectedId}
                      fields={fields}
                      values={values}
                      onOpenSettings={() => setView("settings")}
                    />
                  ) : (
                    <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                      请先在左侧选择一个插件。
                    </Typography.Paragraph>
                  )}
                </div>
              )}
            </div>
          </Sider>
        </Layout>
      </Layout>
    </WidgetCatalogContext.Provider>
  );
}
