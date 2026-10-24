import { useState } from "react";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";

// 登录页：工作台是公开的，未登录只能看到这一页；
// 管理接口（/api/admin/*）全部要求有效会话，所以密钥与令牌不会被匿名访问读到。
export function LoginPage({ onLogin }: { onLogin: (username: string, password: string) => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (values: { username: string; password: string }) => {
    setSubmitting(true);
    setError("");
    try {
      await onLogin(values.username, values.password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "100vh",
        background: "var(--ant-color-fill-quaternary)",
      }}
    >
      <Card style={{ width: 360 }}>
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
          登录工作台
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          首次部署会自动创建 admin 账号；初始密码见容器日志，若来自自动生成则首次登录必须修改。
        </Typography.Paragraph>
        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} />}
        <Form layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input prefix={<UserOutlined />} autoComplete="username" autoFocus />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
