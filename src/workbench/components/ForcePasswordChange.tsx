import { useState } from "react";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { api } from "../api.js";

type PasswordFormValues = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

// 首次部署自动生成密码时，登录后必须先改密；服务端会拒绝其它接口，这里只是对应的 UI。
export function ForcePasswordChange({
  username,
  onChanged,
  onLogout,
}: {
  username: string;
  onChanged: () => void;
  onLogout: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (values: PasswordFormValues) => {
    setSubmitting(true);
    setError("");
    try {
      await api.changePassword(values.currentPassword, values.newPassword);
      onChanged();
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
      <Card style={{ width: 380 }}>
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
          请先修改初始密码
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          账号 <Typography.Text strong>{username}</Typography.Text> 使用的是部署时自动生成的密码。
          初始密码见容器日志或密钥卷内的 initial-admin-password 文件；修改成功后该文件可删除。
        </Typography.Paragraph>
        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} />}
        <Form layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          <Form.Item
            name="currentPassword"
            label="当前密码"
            rules={[{ required: true, message: "请输入当前密码" }]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" autoFocus />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: "请输入新密码" },
              { min: 8, message: "新密码至少 8 位" },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={["newPassword"]}
            rules={[
              { required: true, message: "请再次输入新密码" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("newPassword") === value) return Promise.resolve();
                  return Promise.reject(new Error("两次输入的新密码不一致"));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            修改并进入工作台
          </Button>
          <Button type="link" block style={{ marginTop: 8 }} onClick={onLogout}>
            退出登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
