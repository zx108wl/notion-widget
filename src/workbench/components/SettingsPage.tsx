import { useState } from "react";
import { Button, Layout, Tabs, Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { AccountPanel } from "./AccountPanel.js";
import { AccessTokenPanel } from "./AccessTokenPanel.js";
import { CredentialPanel } from "./CredentialPanel.js";
import { CallLogsPanel } from "./CallLogsPanel.js";

const { Header, Content } = Layout;

// 设置页：集中管理账户、访问令牌、第三方密钥与调用记录，与工作台主视图分离。
export function SettingsPage({ username, onBack }: { username: string; onBack: () => void }) {
  const [active, setActive] = useState("account");

  return (
    <Layout style={{ height: "100vh" }}>
      <Header
        className="app-header"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 24px",
          borderBottom: "1px solid var(--ant-color-border-secondary)",
        }}
      >
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
          返回工作台
        </Button>
        <Typography.Title level={5} style={{ margin: 0 }}>
          设置
        </Typography.Title>
      </Header>
      <Content style={{ padding: 24, overflow: "auto" }}>
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          <Tabs
            activeKey={active}
            onChange={setActive}
            items={[
              { key: "account", label: "账户", children: <AccountPanel username={username} /> },
              {
                key: "tokens",
                label: "访问令牌",
                children: <AccessTokenPanel active={active === "tokens"} />,
              },
              { key: "credentials", label: "第三方密钥", children: <CredentialPanel /> },
              { key: "logs", label: "调用记录", children: <CallLogsPanel /> },
            ]}
          />
        </div>
      </Content>
    </Layout>
  );
}

