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
        algorithm: resolved === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: "#6c5ce7",
          borderRadius: 10,
        },
      }}
    >
      <App themeMode={mode} onThemeModeChange={changeMode} />
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
