import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Alert, Button, Form, Input, Modal, Popconfirm, Select, Table, Typography } from "antd";
import { PlusOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { api, type CredentialRow } from "../api.js";
import { WidgetCatalogContext } from "../context/WidgetCatalogContext.js";

type CredentialFormValues = { provider: string; slot: string; value: string };
type EditingCredential = { provider: string; slot: string } | null;

// 第三方密钥托管：新增与修改（轮换）拆成两个入口。
// - 新增：选择密钥服务 + 适用插件（default=所有插件通用 / 插件名=该插件专属）后保存；
// - 修改：密钥服务与适用插件锁定，只能轮换密钥内容。
// 明文永不回显，界面只显示密钥版本与最后更新时间。
export function CredentialPanel() {
  const catalog = useContext(WidgetCatalogContext);
  const [rows, setRows] = useState<CredentialRow[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [widgetIds, setWidgetIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EditingCredential>(null);
  const [formError, setFormError] = useState("");
  const [form] = Form.useForm<CredentialFormValues>();

  const widgetName = useCallback(
    (id: string) => catalog?.catalog[id]?.name ?? id,
    [catalog],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listCredentials());
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 下拉选项：插件声明的密钥服务 + 插件 id 列表；已存在的记录也并入，避免历史数据无法编辑
  useEffect(() => {
    let cancelled = false;
    api
      .listCredentialProviders()
      .then((options) => {
        if (cancelled) return;
        setProviders(options.providers);
        setWidgetIds(options.widgets);
      })
      .catch(() => {
        // 元数据加载失败不阻塞已有密钥的展示与轮换
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const providerOptions = useMemo(
    () =>
      [...new Set([...providers, ...rows.map((row) => row.provider)])]
        .sort()
        .map((provider) => ({ value: provider, label: provider })),
    [providers, rows],
  );

  const slotOptions = useMemo(() => {
    const ids = new Set(widgetIds);
    for (const row of rows) if (row.slot !== "default") ids.add(row.slot);
    return [
      { value: "default", label: "所有插件通用（default）" },
      ...[...ids]
        .sort()
        .map((id) => ({ value: id, label: `仅 ${widgetName(id)}（${id}）` })),
    ];
  }, [widgetIds, rows, widgetName]);

  const openCreate = () => {
    setEditing(null);
    setFormError("");
    form.resetFields();
    form.setFieldValue("slot", "default");
    setModalOpen(true);
  };

  const openEdit = (row: CredentialRow) => {
    setEditing({ provider: row.provider, slot: row.slot });
    setFormError("");
    form.setFieldsValue({ provider: row.provider, slot: row.slot, value: "" });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setFormError("");
    form.resetFields();
  };

  const handleSave = async (values: CredentialFormValues) => {
    setSaving(true);
    setFormError("");
    try {
      const result = await api.saveCredential(values.provider, values.slot, values.value);
      setFeedback(result.created ? "密钥已新增。" : "密钥已轮换。");
      closeModal();
      await refresh();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (provider: string, slot: string) => {
    setFeedback("");
    setError("");
    try {
      await api.deleteCredential(provider, slot);
      setFeedback(`已删除 ${provider}.${slot}`);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            已配置密钥
          </Typography.Title>
          <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => void refresh()} />
          <div style={{ flex: 1 }} />
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>
            新增密钥
          </Button>
        </div>
        <Table<CredentialRow>
          size="small"
          rowKey={(row) => `${row.provider}.${row.slot}`}
          loading={loading}
          dataSource={rows}
          pagination={false}
          locale={{ emptyText: "还没有配置任何第三方密钥" }}
          columns={[
            { title: "密钥服务", dataIndex: "provider" },
            {
              title: "适用插件",
              dataIndex: "slot",
              render: (slot: string) =>
                slot === "default" ? "所有插件通用" : `仅 ${widgetName(slot)}`,
            },
            { title: "密钥版本", dataIndex: "key_version", width: 84, align: "right" },
            {
              title: "最后更新",
              dataIndex: "updated_at",
              width: 150,
              render: (value: string) => new Date(value).toLocaleString(),
            },
            {
              title: "操作",
              key: "actions",
              width: 110,
              render: (_: unknown, row: CredentialRow) => (
                <div style={{ display: "flex", gap: 4 }}>
                  <Button size="small" type="text" onClick={() => openEdit(row)}>
                    修改
                  </Button>
                  <Popconfirm
                    title="删除该密钥？"
                    description="删除后声明它的插件接口会在运行时提示未配置凭据。"
                    okText="删除"
                    cancelText="取消"
                    onConfirm={() => void handleDelete(row.provider, row.slot)}
                  >
                    <Button size="small" danger type="text">
                      删除
                    </Button>
                  </Popconfirm>
                </div>
              ),
            },
          ]}
        />
      </div>

      {feedback && <Alert type="success" message={feedback} showIcon closable onClose={() => setFeedback("")} />}
      {error && <Alert type="error" message={error} showIcon />}

      <Modal
        title={editing ? "修改密钥（轮换）" : "新增密钥"}
        open={modalOpen}
        onCancel={closeModal}
        footer={null}
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          {editing
            ? "密钥服务与适用插件不可修改；保存后旧值被覆盖且不可恢复。"
            : "同一个「密钥服务 + 适用插件」再次保存即为轮换；default 表示所有声明该服务的插件通用，插件专属值优先于 default。"}
        </Typography.Paragraph>
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{ slot: "default" }}
          onFinish={handleSave}
        >
          <Form.Item
            name="provider"
            label="密钥服务"
            rules={[{ required: true, message: "请选择密钥服务" }]}
          >
            <Select
              placeholder="选择要配置的服务"
              options={providerOptions}
              showSearch
              disabled={Boolean(editing)}
            />
          </Form.Item>
          <Form.Item
            name="slot"
            label="适用插件"
            rules={[{ required: true, message: "请选择适用插件" }]}
          >
            <Select options={slotOptions} disabled={Boolean(editing)} />
          </Form.Item>
          <Form.Item name="value" label="密钥内容" rules={[{ required: true, message: "请输入密钥内容" }]}>
            <Input.Password placeholder="只在保存时提交一次，之后不再回显" autoComplete="off" />
          </Form.Item>
          {formError && <Alert type="error" message={formError} showIcon style={{ marginBottom: 12 }} />}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button onClick={closeModal}>取消</Button>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
              保存
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
