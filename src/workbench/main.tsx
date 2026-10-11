import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, theme } from "antd";
import "../styles/workbench.css";
import zhCN from "antd/locale/zh_CN";
import { App } from "./App.js";

ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#6c5ce7",
          borderRadius: 10,
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);
