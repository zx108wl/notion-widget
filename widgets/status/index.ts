import "../shared.css";
import "./style.css";
import { escapeHtml } from "../shared.js";

export interface StatusConfig {
  title: string;
  refresh: string;
  width: string;
  height: string;
  theme: string;
  accent: string;
}

export function render(root: HTMLElement, config: StatusConfig, { signal }: { signal?: AbortSignal } = {}) {
  // 当前生效配置：update() 与其做 diff，实现参数热更新而不重建 DOM / 不重打健康检查
  let current: StatusConfig = { ...config };

  root.innerHTML = `<section class="embed-card status-card" style="--accent:${config.accent}"><p class="embed-label">${escapeHtml(config.title)}</p><div class="status-line"><span class="status-dot"></span><strong>正在检测…</strong></div><p class="status-time"></p></section>`;

  const card = root.querySelector<HTMLElement>(".status-card")!;
  const titleLabel = root.querySelector<HTMLElement>(".embed-label")!;
  const statusLabel = root.querySelector<HTMLElement>(".status-line strong")!;
  const time = root.querySelector<HTMLElement>(".status-time")!;

  let checkTimer: ReturnType<typeof setInterval> | undefined;
  const cleanup = () => {
    if (checkTimer) clearInterval(checkTimer);
  };
  signal?.addEventListener("abort", cleanup, { once: true });

  // 检测代次：刷新间隔变更重启轮询后，旧请求的迟到结果按代次丢弃
  let checkRun = 0;
  const check = async (run: number) => {
    try {
      // 不把 signal 传给 fetch：热更新销毁实例时中断请求会在控制台产生 net::ERR_ABORTED 噪音，
      // 保留 aborted 守卫即可阻止过期实例写 DOM
      const response = await fetch("/api/health", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (signal?.aborted || run !== checkRun) return;
      card.dataset.status = "ready";
      statusLabel.textContent = "运行正常";
      time.textContent = `更新时间：${new Date(data.time).toLocaleString("zh-CN")}`;
    } catch {
      if (signal?.aborted || run !== checkRun) return;
      card.dataset.status = "error";
      statusLabel.textContent = "暂时无法连接";
      time.textContent = `检测时间：${new Date().toLocaleString("zh-CN")}`;
    }
  };
  const startChecking = () => {
    const run = ++checkRun;
    void check(run);
    if (checkTimer) clearInterval(checkTimer);
    checkTimer = setInterval(() => void check(run), Number(current.refresh) * 1000);
  };
  startChecking();

  return {
    // 参数热更新：只改受影响的局部（theme/width/height 由宿主在 render 之外处理）
    update(next: StatusConfig) {
      const prev = current;
      current = { ...next };
      if (prev.title !== current.title) titleLabel.textContent = current.title;
      if (prev.accent !== current.accent) card.style.setProperty("--accent", current.accent);
      if (prev.refresh !== current.refresh) startChecking();
    },
    destroy() {
      cleanup();
      signal?.removeEventListener("abort", cleanup);
    },
  };
}
