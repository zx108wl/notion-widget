import { useState } from "react";
import { Alert, Button, Divider, Form, Input, Typography } from "antd";
import { api } from "../api.js";

type PasswordFormValues = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type UsernameFormValues = { username: string };

// 账号名规则与服务端保持一致：2-32 位，文字/数字/点/下划线/连字符
const USERNAME_RE = /^[\p{L}\p{N}._-]{2,32}$/u;

// 账户设置：修改账号名与密码。
// 会话按 user_id 关联，改名不需要重新登录；改密码会主动踢掉其它会话，当前会话保持登录。
export function AccountPanel({
  username,
  onUsernameChange,
}: {
  username: string;
  onUsernameChange: (username: string) => void;
}) {
  const [form] = Form.useForm<PasswordFormValues>();
  const [nameForm] = Form.useForm<UsernameFormValues>();
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const handleRename = async (values: UsernameFormValues) => {
    const next = values.username.trim();
    if (next === username) {
      setFeedback("账号名没有变化。");
      return;
    }
    setRenaming(true);
    setError("");
    setFeedback("");
    try {
      const user = await api.updateUsername(next);
      onUsernameChange(user.username);
      setFeedback(`账号名已更新为 ${user.username}。`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRenaming(false);
    }
  };

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
          当前账号：<Typography.Text strong>{username}</Typography.Text>。账号名与密码都在这里修改；
          部署时 `.env` 的 ADMIN_USERNAME 只用于首次创建管理员，之后不会覆盖。
        </Typography.Paragraph>
      </div>

      {error && <Alert type="error" message={error} showIcon closable onClose={() => setError("")} />}
      {feedback && (
        <Alert type="success" message={feedback} showIcon closable onClose={() => setFeedback("")} />
      )}

      <Form<UsernameFormValues>
        key={username}
        form={nameForm}
        layout="vertical"
        style={{ maxWidth: 420, marginBottom: 0 }}
        initialValues={{ username }}
        onFinish={(values) => void handleRename(values)}
        requiredMark={false}
      >
        <Form.Item
          name="username"
          label="账号名"
          extra="2-32 位，可包含文字、数字、点、下划线或连字符"
          rules={[
            { required: true, message: "请输入账号名" },
            { pattern: USERNAME_RE, message: "只能包含文字、数字、点、下划线或连字符，长度 2-32 位" },
          ]}
        >
          <Input maxLength={32} placeholder="账号名" />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <Button htmlType="submit" loading={renaming}>
            保存账号名
          </Button>
        </Form.Item>
      </Form>

      <Divider style={{ margin: 0 }} />

      <Typography.Title level={5} style={{ margin: 0 }}>
        修改密码
      </Typography.Title>

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
