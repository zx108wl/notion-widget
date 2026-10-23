import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, theme } from "antd";
import "../styles/workbench.css";
import zhCN from "antd/locale/zh_CN";
import { App } from "./App.js";
import { useTheme } from "./useTheme.js";

function Root() {
  const { mode, resolved, changeMode } = useTheme();
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        // 开启 CSS 变量模式：var(--ant-color-*) 真实存在并随主题算法自动切换，
        // 工作台自定义样式（棋盘格/侧边栏/预览框）直接引用这些变量即可
        cssVar: true,
        algorithm: resolved === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: "#6c5ce7",
          borderRadius: 10,
        },
        components: {
          Layout: {
            // antd 默认 headerBg 为深色 #001529，覆盖为容器底色
            headerBg: "var(--ant-color-bg-container)",
          },
          Menu: {
            fontSize: 15,
            itemHeight: 42,
            itemBorderRadius: 8,
            itemMarginInline: 8,
            itemMarginBlock: 4,
            activeBarBorderWidth: 3,
            // 选中态加强：antd 默认选中底色过淡（与边栏 #fafafa 几乎无差），用 primary 18% 调和
            itemSelectedBg:
              "color-mix(in srgb, var(--ant-color-primary) 18%, var(--ant-color-fill-quaternary))",
            // 工作台图标统一为 26×26 方块，折叠态按此尺寸由 antd padding 公式居中
            collapsedIconSize: 26,
          },
        },
      }}
    >
      <App themeMode={mode} resolvedTheme={resolved} onThemeModeChange={changeMode} />
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
