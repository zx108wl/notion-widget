import "../shared.css";
import "./style.css";
import { escapeHtml } from "../shared.js";
import type { WidgetRenderOptions } from "../../src/core/runtime/index.js";

export interface SecretDemoConfig {
  title: string;
  width: string;
  height: string;
  theme: string;
  accent: string;
}

interface SecretPayload {
  configured?: boolean;
  ref?: string;
  value?: string;
  length?: number;
  readAt?: string;
  error?: string;
  hint?: string;
}

type ViewState = "loading" | "ready" | "empty" | "error";

export function render(root: HTMLElement, config: SecretDemoConfig, options: WidgetRenderOptions) {
  const { signal, authToken } = options;
  // 接口声明了 auth: "token"：带嵌入令牌时用 Bearer；工作台同源预览没有令牌，走会话 Cookie
  const authHeaders: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  let current: SecretDemoConfig = { ...config };
  let secret = "";
  let masked = false;
  let run = 0;
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  root.innerHTML = `<section class="embed-card secret-card" data-state="loading" style="--accent:${config.accent}">
    <header class="secret-head">
      <p class="embed-label">${escapeHtml(config.title)}</p>
      <code class="secret-ref">secretDemo.default</code>
    </header>
    <div class="secret-value">
      <span class="secret-status" aria-hidden="true"></span>
      <code class="secret-text" aria-live="polite">正在读取…</code>
    </div>
    <p class="secret-hint" aria-live="polite"></p>
    <div class="secret-actions">
      <button type="button" class="secret-button secret-toggle" hidden>隐藏</button>
      <button type="button" class="secret-button secret-copy" hidden>复制</button>
      <button type="button" class="secret-button secret-refresh">刷新</button>
    </div>
  </section>`;

  const card = root.querySelector<HTMLElement>(".secret-card")!;
  const label = root.querySelector<HTMLElement>(".embed-label")!;
  const text = root.querySelector<HTMLElement>(".secret-text")!;
  const hint = root.querySelector<HTMLElement>(".secret-hint")!;
  const toggle = root.querySelector<HTMLButtonElement>(".secret-toggle")!;
  const copy = root.querySelector<HTMLButtonElement>(".secret-copy")!;
  const refresh = root.querySelector<HTMLButtonElement>(".secret-refresh")!;

  const paint = () => {
    text.textContent = masked ? "•".repeat(Math.min(secret.length, 32)) : secret;
    toggle.textContent = masked ? "显示" : "隐藏";
  };

  // 非就绪状态统一收起展示类按钮，只保留刷新
  const settle = (state: ViewState, message: string, detail: string) => {
    card.dataset.state = state;
    text.textContent = message;
    hint.textContent = detail;
    toggle.hidden = true;
    copy.hidden = true;
  };

  // 代次守卫：重复刷新时丢弃迟到的旧响应
  const load = async () => {
    const currentRun = ++run;
    card.dataset.state = "loading";
    text.textContent = "正在读取…";
    hint.textContent = "";
    toggle.hidden = true;
    copy.hidden = true;

    try {
      const response = await fetch("/api/secret_demo/secret", {
        cache: "no-store",
        headers: authHeaders,
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await response.json()) as SecretPayload;
      if (signal.aborted || currentRun !== run) return;

      if (!response.ok) {
        // 401 不是"密钥内容错了"，而是当前页面没有任何可用凭据：
        // 工作台预览靠管理员会话，嵌入页必须带 #t= 令牌
        if (response.status === 401) {
          settle(
            "error",
            "缺少访问令牌",
            "工作台预览由管理员会话放行；嵌入到 Notion 请使用「设置 → 访问令牌」生成的带 #t= 的嵌入链接。",
          );
          return;
        }
        const detail = [data.error, data.hint].filter(Boolean).join(" ");
        settle("error", "读取密钥失败", detail || `接口返回 HTTP ${response.status}`);
        return;
      }

      if (!data.configured) {
        settle(
          "empty",
          "尚未配置密钥",
          "前往「设置 → 第三方密钥」，为 secretDemo.default 填入任意值后点击刷新。",
        );
        return;
      }

      secret = data.value ?? "";
      masked = false;
      card.dataset.state = "ready";
      paint();
      toggle.hidden = false;
      copy.hidden = false;
      const length = data.length ?? secret.length;
      const time = data.readAt ? new Date(data.readAt).toLocaleTimeString("zh-CN") : "";
      hint.textContent = `服务端凭据托管解密读取 · ${length} 个字符${time ? ` · ${time}` : ""}`;
    } catch (error) {
      if (signal.aborted || currentRun !== run) return;
      console.error(error);
      settle("error", "读取密钥失败", "无法连接后端接口，请确认服务已启动后重试。");
    }
  };

  toggle.addEventListener("click", () => {
    masked = !masked;
    paint();
  });

  copy.addEventListener("click", async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      if (copyTimer) clearTimeout(copyTimer);
      hint.textContent = "已复制到剪贴板。";
      copyTimer = setTimeout(() => {
        if (!signal.aborted && hint.textContent === "已复制到剪贴板。") {
          hint.textContent = `服务端凭据托管解密读取 · ${secret.length} 个字符`;
        }
      }, 1600);
    } catch {
      hint.textContent = "复制失败，请手动选中密钥后复制。";
    }
  });

  refresh.addEventListener("click", () => void load());

  signal?.addEventListener(
    "abort",
    () => {
      run += 1;
      if (copyTimer) clearTimeout(copyTimer);
    },
    { once: true },
  );

  void load();

  return {
    // 参数热更新：只改受影响的局部（theme/width/height 由宿主在 render 之外处理）
    update(next: SecretDemoConfig) {
      const prev = current;
      current = { ...next };
      if (prev.title !== current.title) label.textContent = current.title;
      if (prev.accent !== current.accent) card.style.setProperty("--accent", current.accent);
    },
    destroy() {
      run += 1;
      if (copyTimer) clearTimeout(copyTimer);
    },
  };
}
