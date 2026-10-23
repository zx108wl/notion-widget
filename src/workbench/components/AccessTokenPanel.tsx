import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Checkbox, Modal, Popconfirm, Table, Tag, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { api, type TokenRequestStat, type TokenRow } from "../api.js";

// 访问令牌管理：列表、查看调用分布与删除。
// 签发入口是与「配置面板」平级的右侧「签发令牌」选项卡，令牌天然绑定插件与当前配置参数；
// 令牌明文只在签发时显示一次，这里不再回显、也无法再次生成完整链接。
export function AccessTokenPanel({ active = true }: { active?: boolean }) {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  // 查看弹窗：detail 非空即展示该令牌的调用分布
  const [detail, setDetail] = useState<TokenRow | null>(null);
  const [requests, setRequests] = useState<TokenRequestStat[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  // 删除弹窗：默认保留调用记录，勾选后才一并清除
  const [deleting, setDeleting] = useState<TokenRow | null>(null);
  const [clearLogs, setClearLogs] = useState(false);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setTokens(await api.listTokens());
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active) void refresh();
  }, [active, refresh]);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    setFeedback("");
    try {
      await api.deleteToken(deleting.id, clearLogs);
      setFeedback(
        clearLogs
          ? "令牌已删除，调用记录已清除。"
          : "令牌已删除，调用记录已保留，将按「调用记录」页的保留天数自动过期。",
      );
      setDeleting(null);
      setClearLogs(false);
      await refresh();
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setDeletingBusy(false);
    }
  };

  const loadRequests = async (row: TokenRow) => {
    setDetailLoading(true);
    try {
      setRequests(await api.tokenRequests(row.id));
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setDetailLoading(false);
    }
  };

  const openDetail = async (row: TokenRow) => {
    setDetail(row);
    setRequests([]);
    await loadRequests(row);
  };

  const toggleBlock = async (tokenId: string, stat: TokenRequestStat) => {
    if (!stat.ip) return;
    setFeedback("");
    try {
      if (stat.blocked) await api.unblockTokenIp(tokenId, stat.ip);
      else await api.blockTokenIp(tokenId, stat.ip);
      const row = tokens.find((item) => item.id === tokenId);
      if (row) await loadRequests(row);
    } catch (err) {
      setFeedback((err as Error).message);
    }
  };

  const totalCalls = requests.reduce((sum, item) => sum + item.calls, 0);
  const sourceIps = new Set(requests.map((item) => item.ip ?? "未知")).size;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 4 }}>
          访问令牌
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
          令牌在插件右侧的「签发令牌」选项卡中签发；令牌明文只在签发时显示一次，无法再次查看。删除令牌会立即失效，默认保留调用记录以便追溯，也可在确认框里勾选一并清除；「查看」可看到各来源 IP 的调用次数与最近调用，并可禁用可疑 IP。
        </Typography.Paragraph>
      </div>

      {feedback && <Alert type="info" message={feedback} showIcon closable onClose={() => setFeedback("")} />}
      {error && <Alert type="error" message={error} showIcon />}

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            已签发令牌
          </Typography.Title>
          <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => void refresh()} />
        </div>
        <Table<TokenRow>
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={tokens}
          pagination={false}
          locale={{ emptyText: "还没有签发过令牌" }}
          columns={[
            {
              title: "令牌 ID",
              dataIndex: "id",
              width: 220,
              render: (_: string, row: TokenRow) => (
                <div style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: "100%" }}>
                  {/* 绿点表示令牌生效中；历史注销记录为灰点 */}
                  <Badge status={row.status === "active" ? "success" : "default"} />
                  <Typography.Text code ellipsis={{ tooltip: row.id }} style={{ minWidth: 0 }}>
                    {row.id}
                  </Typography.Text>
                </div>
              ),
            },
            { title: "插件", dataIndex: "widget_id", width: 96 },
            { title: "备注", dataIndex: "label", render: (label: string | null) => label || "—" },
            {
              title: "操作",
              key: "actions",
              width: 112,
              render: (_: unknown, row: TokenRow) => (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Button size="small" type="text" onClick={() => void openDetail(row)}>
                    查看
                  </Button>
                  <Button
                    size="small"
                    type="text"
                    danger
                    onClick={() => {
                      setClearLogs(false);
                      setDeleting(row);
                    }}
                  >
                    删除
                  </Button>
                </div>
              ),
            },
          ]}
        />

        {/* 关闭即卸载，跳过离场动画，避免遮罩残留拦截点击 */}
        {detail && (
          <Modal
            title="令牌调用详情"
            open
            width={720}
            onCancel={() => setDetail(null)}
            footer={
              <Button type="primary" onClick={() => setDetail(null)}>
                关闭
              </Button>
            }
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                令牌 <Typography.Text code>{detail.id}</Typography.Text> · {detail.widget_id}
                {detail.label ? `（${detail.label}）` : ""}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                近 7 天共 {totalCalls} 次调用，来自 {sourceIps} 个来源 IP。
              </Typography.Text>
              <Table<TokenRequestStat>
                size="small"
                rowKey={(row) => row.ip ?? "unknown"}
                loading={detailLoading}
                dataSource={requests}
                pagination={false}
                locale={{ emptyText: "该令牌近 7 天没有接口调用" }}
                columns={[
                  {
                    title: "发起 IP",
                    dataIndex: "ip",
                    render: (ip: string | null, row: TokenRequestStat) => (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Typography.Text code>{ip || "—"}</Typography.Text>
                        {row.blocked && <Tag color="red">已禁用</Tag>}
                      </div>
                    ),
                  },
                  { title: "调用次数", dataIndex: "calls", width: 100, align: "right" },
                  {
                    title: "最近调用",
                    dataIndex: "lastAt",
                    width: 180,
                    render: (ts: number | null) => (ts ? new Date(ts).toLocaleString() : "—"),
                  },
                  {
                    title: "操作",
                    key: "actions",
                    width: 90,
                    render: (_: unknown, row: TokenRequestStat) =>
                      !row.ip ? (
                        "—"
                      ) : row.blocked ? (
                        <Button size="small" type="text" onClick={() => void toggleBlock(detail.id, row)}>
                          解除
                        </Button>
                      ) : (
                        <Popconfirm
                          title="禁用该 IP？"
                          description="禁用后该 IP 使用此令牌的调用会返回 403，可随时解除。"
                          okText="禁用"
                          cancelText="取消"
                          okButtonProps={{ danger: true }}
                          onConfirm={() => void toggleBlock(detail.id, row)}
                        >
                          <Button size="small" type="text" danger>
                            禁用
                          </Button>
                        </Popconfirm>
                      ),
                  },
                ]}
              />
            </div>
          </Modal>
        )}
        {deleting && (
          <Modal
            title="删除令牌"
            open
            width={480}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            confirmLoading={deletingBusy}
            onOk={() => void handleDelete()}
            onCancel={() => setDeleting(null)}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Typography.Paragraph style={{ margin: 0 }}>
                令牌 <Typography.Text code>{deleting.id}</Typography.Text>（{deleting.widget_id}）将立即失效，
                密钥授权与 IP 禁用规则一并清除，不可恢复。
              </Typography.Paragraph>
              <Checkbox checked={clearLogs} onChange={(event) => setClearLogs(event.target.checked)}>
                同时清除该令牌的调用记录
              </Checkbox>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                不勾选时调用记录会保留，便于事后追查，并按「调用记录」页设置的保留天数自动过期。
              </Typography.Text>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}
