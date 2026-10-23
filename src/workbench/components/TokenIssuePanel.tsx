import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Checkbox, Form, Input, Modal, Tag, Typography } from "antd";
import { CopyOutlined, KeyOutlined } from "@ant-design/icons";
import {
  api,
  type CredentialRequirement,
  type CredentialRow,
  type IssuedToken,
} from "../api.js";
import { validateValues } from "../../core/validation/index.js";
import type { Field } from "../../core/schema/field.schema.js";
import { buildWidgetUrl } from "../widget-url.js";

const EMPTY_REQUIREMENTS: CredentialRequirement[] = [];

// 插件侧边栏「签发令牌」选项卡：表单直接内联，签发成功后用弹窗展示完整链接。
// 令牌列表与注销仍在设置页；令牌明文只在签发成功时显示一次。
export function TokenIssuePanel({
  widgetId,
  widgetName,
  fields,
  values,
  onOpenSettings,
}: {
  widgetId: string;
  widgetName: string;
  fields: Field[];
  values: Record<string, string>;
  onOpenSettings: () => void;
}) {
  const [auth, setAuth] = useState<"none" | "token" | null>(null);
  const [declared, setDeclared] = useState<CredentialRequirement[]>(EMPTY_REQUIREMENTS);
  const [configured, setConfigured] = useState<CredentialRow[]>([]);
  const [issued, setIssued] = useState<IssuedToken | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [copyHint, setCopyHint] = useState("");
  // 关闭弹窗后自增，让内联表单重新挂载，得到空表单与默认勾选
  const [formKey, setFormKey] = useState(0);

  // 切换插件时重新拉取该插件的令牌要求与已配置密钥
  useEffect(() => {
    setAuth(null);
    setDeclared(EMPTY_REQUIREMENTS);
    setConfigured([]);
    setIssued(null);
    setFeedback("");
    setCopyHint("");
    let cancelled = false;
    Promise.all([api.listWidgetMeta(), api.listCredentials()])
      .then(([meta, credentials]) => {
        if (cancelled) return;
        setAuth(meta.auth[widgetId] ?? "none");
        setDeclared(meta.widgets[widgetId] ?? EMPTY_REQUIREMENTS);
        setConfigured(credentials);
      })
      .catch(() => {
        if (!cancelled) setAuth("none");
      });
    return () => {
      cancelled = true;
    };
  }, [widgetId]);

  const configuredSet = useMemo(() => new Set(configured.map((item) => `${item.provider}.${item.slot}`)), [configured]);
  const selectable = useMemo(
    () => declared.filter((item) => configuredSet.has(item.ref)),
    [declared, configuredSet],
  );
  const requiredItems = useMemo(() => declared.filter((item) => item.required !== false), [declared]);
  const unconfiguredRequired = useMemo(
    () => requiredItems.filter((item) => !configuredSet.has(item.ref)),
    [requiredItems, configuredSet],
  );
  const unconfiguredOptional = useMemo(
    () => declared.filter((item) => item.required === false && !configuredSet.has(item.ref)),
    [declared, configuredSet],
  );
  const requiredSelectableRefs = useMemo(
    () => selectable.filter((item) => item.required !== false).map((item) => item.ref),
    [selectable],
  );

  const invalid = useMemo(() => validateValues(fields, values).length > 0, [fields, values]);
  const baseUrl = useMemo(
    () => (invalid || !fields.length ? "" : buildWidgetUrl(widgetId, fields, values)),
    [invalid, fields, values, widgetId],
  );

  const handleIssue = async (formValues: { label?: string; credentials?: string[] }) => {
    setSubmitting(true);
    setFeedback("");
    setCopyHint("");
    try {
      const result = await api.createToken(widgetId, formValues.label ?? "", formValues.credentials ?? []);
      // 带上当前配置参数与令牌，得到可直接粘贴到 Notion 的完整链接
      setIssued({ ...result, url: `${baseUrl}#t=${result.value}` });
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const closeIssued = () => {
    setIssued(null);
    setCopyHint("");
    setFormKey((key) => key + 1);
  };

  const copy = async (text: string, hint: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint(hint);
    } catch {
      setCopyHint("复制失败，请手动选中复制。");
    }
  };

  if (!auth) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 4 }}>
          签发嵌入令牌
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
          令牌绑定当前插件与当前配置参数（{widgetName}），明文只在签发时显示一次。
        </Typography.Paragraph>
      </div>

      {auth === "none" ? (
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 0, marginBottom: 0 }}>
          该插件接口无需访问令牌，直接复制预览区的嵌入 URL 即可。
        </Typography.Paragraph>
      ) : (
        <>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 0, marginBottom: 0 }}>
            该插件接口需要访问令牌：签发后复制带当前配置的完整链接，粘贴到 Notion 即可。
          </Typography.Paragraph>
          {invalid && (
            <Alert
              type="warning"
              showIcon
              message="配置参数有误"
              description="请先在「配置面板」修正配置项，再签发令牌。"
            />
          )}
          {unconfiguredRequired.length > 0 && (
            <Alert
              type="error"
              showIcon
              message="必选密钥未配置，暂时无法签发令牌"
              description={`请先到「设置 → 第三方密钥」完成配置：${unconfiguredRequired
                .map((item) => `${item.label}（${item.ref}）`)
                .join("、")}`}
            />
          )}
          <Form
            key={formKey}
            layout="vertical"
            onFinish={handleIssue}
            requiredMark={false}
            initialValues={{ credentials: requiredSelectableRefs }}
          >
            <Form.Item label="插件">
              <Typography.Text>
                {widgetName}（{widgetId}）
              </Typography.Text>
            </Form.Item>
            <Form.Item name="label" label="备注">
              <Input placeholder="例如：我的日历页" maxLength={64} />
            </Form.Item>
            <Form.Item name="credentials" label="授权密钥">
              <Checkbox.Group
                options={selectable.map((item) => ({
                  value: item.ref,
                  disabled: item.required !== false,
                  label: (
                    <span>
                      {item.label}（{item.ref}）
                      <Tag color={item.required !== false ? "blue" : "default"} style={{ marginLeft: 6 }}>
                        {item.required !== false ? "必选" : "可选"}
                      </Tag>
                    </span>
                  ),
                }))}
                disabled={!selectable.length}
              />
            </Form.Item>
            {unconfiguredRequired.length === 0 && requiredItems.length > 0 && (
              <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: -8 }}>
                必选密钥已自动授权且不可取消；可选密钥可按需勾选，不同组合对应不同的第三方密钥权限。
              </Typography.Paragraph>
            )}
            {unconfiguredOptional.length > 0 && (
              <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: -8 }}>
                以下可选密钥尚未配置，不勾选不影响签发：
                {unconfiguredOptional.map((item) => `${item.label}（${item.ref}）`).join("、")}
              </Typography.Paragraph>
            )}
            {declared.length === 0 && (
              <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: -8 }}>
                该插件未声明第三方密钥，无需授权。
              </Typography.Paragraph>
            )}
            {feedback && <Alert type="error" showIcon message={feedback} style={{ marginBottom: 16 }} />}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Button
                type="primary"
                htmlType="submit"
                icon={<KeyOutlined />}
                loading={submitting}
                disabled={unconfiguredRequired.length > 0 || !baseUrl}
              >
                签发
              </Button>
              <Button type="link" size="small" style={{ paddingInline: 0 }} onClick={onOpenSettings}>
                管理已签发令牌
              </Button>
            </div>
          </Form>
        </>
      )}

      {/* 关闭即卸载，跳过离场动画，避免遮罩残留拦截点击 */}
      {issued && (
        <Modal
          title={`签发成功 · ${widgetName}`}
          open
          onCancel={closeIssued}
          footer={[
            <Button key="copy" icon={<CopyOutlined />} onClick={() => void copy(issued.url, "嵌入链接已复制。")}>
              复制嵌入链接
            </Button>,
            <Button key="ok" type="primary" onClick={closeIssued}>
              我已保存
            </Button>,
          ]}
        >
          <Alert
            type="warning"
            showIcon
            message="令牌明文只显示这一次"
            description="请现在复制完整嵌入链接，关闭后无法再次查看。任何拿到该链接的人都能访问对应插件的接口，请妥善保管。"
            style={{ marginBottom: 12 }}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            嵌入链接（粘到 Notion 的 /embed）
          </Typography.Text>
          <div style={{ display: "flex", gap: 8, margin: "6px 0 12px" }}>
            <Input value={issued.url} readOnly />
            <Button icon={<CopyOutlined />} onClick={() => void copy(issued.url, "嵌入链接已复制。")} />
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            令牌
          </Typography.Text>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <Input value={issued.value} readOnly />
            <Button icon={<CopyOutlined />} onClick={() => void copy(issued.value, "令牌已复制。")} />
          </div>
          {issued.credentials.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                已授权密钥
              </Typography.Text>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {issued.credentials.map((ref) => (
                  <Tag key={ref}>{ref}</Tag>
                ))}
              </div>
            </div>
          )}
          {copyHint && (
            <Alert type="info" showIcon message={copyHint} style={{ marginTop: 12 }} />
          )}
        </Modal>
      )}
    </div>
  );
}
