import { Button, Segmented, Tooltip, Typography } from "antd";
import { AppstoreOutlined, DesktopOutlined, LogoutOutlined, MoonOutlined, SettingOutlined, SunOutlined } from "@ant-design/icons";
import type { ThemeMode } from "../useTheme.js";

const THEME_OPTIONS = [
  { label: "跟随系统", value: "auto", icon: <DesktopOutlined /> },
  { label: "浅色", value: "light", icon: <SunOutlined /> },
  { label: "深色", value: "dark", icon: <MoonOutlined /> },
];

export function AppHeader({
  themeMode,
  onThemeModeChange,
  username,
  onLogout,
  onOpenSettings,
}: {
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  username: string;
  onLogout: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <>
      <Typography.Title level={5} style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 26,
            height: 26,
            display: "grid",
            placeItems: "center",
            borderRadius: 8,
            background: "var(--ant-color-primary, #6c5ce7)",
            color: "#fff",
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          <AppstoreOutlined />
        </span>
        Notion 小组件
      </Typography.Title>
      <div style={{ flex: 1 }} />
      <Segmented
        options={THEME_OPTIONS}
        value={themeMode}
        onChange={(v) => onThemeModeChange(v as ThemeMode)}
      />
      <Tooltip title="设置">
        <Button type="text" icon={<SettingOutlined />} onClick={onOpenSettings} />
      </Tooltip>
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {username}
      </Typography.Text>
      <Tooltip title="退出登录">
        <Button type="text" icon={<LogoutOutlined />} onClick={onLogout} />
      </Tooltip>
    </>
  );
}
