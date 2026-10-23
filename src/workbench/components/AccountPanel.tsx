import { useState } from "react";
import { Alert, Button, Form, Input, Typography } from "antd";
import { api } from "../api.js";

type PasswordFormValues = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

// 账户设置：当前账号信息与修改密码。
// 改密码成功后会主动踢掉其它会话（服务端可撤销），当前会话保持登录。
export function AccountPanel({ username }: { username: string }) {
  const [form] = Form.useForm<PasswordFormValues>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const handleFinish = async (values: PasswordFormValues) => {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const result = await api.changePassword(values.currentPassword, values.newPassword);
      setFeedback(
        result.revokedSessions > 0
          ? `密码已更新，并已退出 ${result.revokedSessions} 个其它登录。`
          : "密码已更新。",
      );
      form.resetFields();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 4 }}>
          账户设置
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
          当前账号：<Typography.Text strong>{username}</Typography.Text>。账号由部署时
          `.env` 中的 ADMIN_USERNAME 初始化，这里只支持修改密码。
        </Typography.Paragraph>
      </div>

      {error && <Alert type="error" message={error} showIcon closable onClose={() => setError("")} />}
      {feedback && (
        <Alert type="success" message={feedback} showIcon closable onClose={() => setFeedback("")} />
      )}

      <Form<PasswordFormValues>
        form={form}
        layout="vertical"
        style={{ maxWidth: 420 }}
        onFinish={(values) => void handleFinish(values)}
        requiredMark={false}
      >
        <Form.Item
          name="currentPassword"
          label="当前密码"
          rules={[{ required: true, message: "请输入当前密码" }]}
        >
          <Input.Password autoComplete="current-password" placeholder="当前登录密码" />
        </Form.Item>
        <Form.Item
          name="newPassword"
          label="新密码"
          rules={[
            { required: true, message: "请输入新密码" },
            { min: 8, message: "新密码至少 8 位" },
          ]}
        >
          <Input.Password autoComplete="new-password" placeholder="至少 8 位" />
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
          <Input.Password autoComplete="new-password" placeholder="再输入一次新密码" />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <Button type="primary" htmlType="submit" loading={busy}>
            保存新密码
          </Button>
        </Form.Item>
      </Form>

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        修改密码后，其它设备上的登录会自动失效，需要用新密码重新登录；当前浏览器保持登录。
      </Typography.Text>
    </div>
  );
}
