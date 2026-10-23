import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Popconfirm, Select, Table, Tag, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { api, type CallLogRow, type CallLogStats, type TokenRow } from "../api.js";

// 调用记录列表：可按令牌过滤，展示近 N 天内的接口调用明细。
// 同时管理保留期与手动清理——删除令牌不再默认抹掉记录，这里负责数据的生命周期。
const RETENTION_OPTIONS = [1, 3, 7, 14, 30, 60, 90].map((value) => ({ value, label: `${value} 天` }));
const CLEANUP_OPTIONS = [1, 7, 30, 90].map((value) => ({ value, label: `${value} 天前` }));

export function CallLogsPanel() {
  const [logs, setLogs] = useState<CallLogRow[]>([]);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [stats, setStats] = useState<CallLogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenId, setTokenId] = useState<string | undefined>(undefined);
  const [days, setDays] = useState(7);
  const [cleanupDays, setCleanupDays] = useState(30);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextLogs, nextStats] = await Promise.all([
        api.listCallLogs(tokenId, days, 200),
        api.callLogStats(),
      ]);
      setLogs(nextLogs);
      setStats(nextStats);
    } catch (err) {
      setLogs([]);
      setNotice((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tokenId, days]);

  useEffect(() => {
    void api.listTokens().then(setTokens).catch(() => undefined);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const changeRetention = async (value: number) => {
    setNotice("");
    try {
      const next = await api.setCallLogRetention(value);
      setStats(next);
      setNotice(`保留期已改为 ${next.retentionDays} 天，超出保留期的记录已清理。`);
      await load();
    } catch (err) {
      setNotice((err as Error).message);
    }
  };

  const cleanup = async (olderThanDays?: number) => {
    setNotice("");
    try {
      const result = await api.clearCallLogs(olderThanDays);
      setStats(result.stats);
      setNotice(`已清理 ${result.deleted} 条调用记录。`);
      await load();
    } catch (err) {
      setNotice((err as Error).message);
    }
  };

  const tokenLabel = useMemo(() => {
    const map = new Map(tokens.map((t) => [t.id, t]));
    return (id: string) => {
      const t = map.get(id);
      // 令牌被删除后记录仍保留：显式标注，避免看到裸 ID 误以为是脏数据
      return t ? `${t.widget_id}${t.label ? `（${t.label}）` : ""}` : `已删除令牌（${id}）`;
    };
  }, [tokens]);

  const formatTime = (ts: number | null) => (ts ? new Date(ts).toLocaleString() : "—");
  const statsText = stats
    ? stats.total > 0
      ? `当前共 ${stats.total} 条记录 · 最早 ${formatTime(stats.oldest)} · 最新 ${formatTime(stats.newest)}`
      : "当前没有调用记录"
    : "正在统计…";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 4 }}>
          调用记录
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
          只记录令牌校验通过的调用（工作台预览不计数）。超过保留期的明细会自动清理；删除令牌时若未勾选「同时清除调用记录」，历史记录会保留并在此显示为「已删除令牌」。
        </Typography.Paragraph>
      </div>

      {notice && <Alert type="info" message={notice} showIcon closable onClose={() => setNotice("")} />}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Select
          allowClear
          placeholder="按令牌过滤（默认全部）"
          style={{ minWidth: 280 }}
          value={tokenId}
          onChange={(v) => setTokenId(v)}
          options={tokens.map((t) => ({
            value: t.id,
            label: `${t.widget_id} — ${t.label || t.id}`,
          }))}
        />
        <Select
          style={{ width: 120 }}
          value={days}
          onChange={setDays}
          options={[
            { value: 1, label: "近 1 天" },
            { value: 7, label: "近 7 天" },
            { value: 30, label: "近 30 天" },
          ]}
        />
        <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => void load()} />

        <span style={{ flex: 1 }} />

        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          保留
        </Typography.Text>
        <Select
          size="small"
          style={{ width: 88 }}
          value={stats?.retentionDays ?? 7}
          onChange={(value) => void changeRetention(value)}
          options={RETENTION_OPTIONS}
        />
        <Select
          size="small"
          style={{ width: 96 }}
          value={cleanupDays}
          onChange={setCleanupDays}
          options={CLEANUP_OPTIONS}
        />
        <Popconfirm
          title="清理早于此时间的调用记录？"
          description={`将删除 ${cleanupDays} 天前的明细，不可恢复。`}
          okText="清理"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={() => void cleanup(cleanupDays)}
        >
          <Button size="small">清理</Button>
        </Popconfirm>
        <Popconfirm
          title="清空全部调用记录？"
          description="所有令牌的调用明细都会被删除，不可恢复。"
          okText="清空"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={() => void cleanup()}
        >
          <Button size="small" danger>
            清空全部
          </Button>
        </Popconfirm>
      </div>

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {statsText}
      </Typography.Text>

      <Table<CallLogRow>
        size="small"
        rowKey={(row, index) => `${row.ts}-${row.tokenId}-${index}`}
        loading={loading}
        dataSource={logs}
        pagination={{ pageSize: 20, size: "small" }}
        locale={{ emptyText: "暂无调用记录" }}
        scroll={{ x: 760 }}
        columns={[
          {
            title: "时间",
            dataIndex: "ts",
            width: 160,
            render: (ts: number) => new Date(ts).toLocaleString(),
          },
          { title: "方法", dataIndex: "method", width: 70 },
          { title: "路径", dataIndex: "path" },
          {
            title: "状态",
            dataIndex: "status",
            width: 80,
            render: (status: number) => (
              <Tag color={status >= 500 ? "red" : status >= 400 ? "orange" : "green"}>{status}</Tag>
            ),
          },
          { title: "耗时", dataIndex: "durationMs", width: 80, align: "right", render: (ms: number) => `${ms}ms` },
          { title: "IP", dataIndex: "ip", width: 130, render: (ip: string | null) => ip || "—" },
          {
            title: "令牌",
            dataIndex: "tokenId",
            width: 200,
            render: (id: string) => <Typography.Text type="secondary">{tokenLabel(id)}</Typography.Text>,
          },
        ]}
      />
    </div>
  );
}
