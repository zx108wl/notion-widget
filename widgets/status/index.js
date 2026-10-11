import "../shared.css";
import "./style.css";
import { escapeHtml } from "../shared.js";

export function render(root, config, { signal } = {}) {
  const timers = [];
  const repeat = (callback, delay) => timers.push(setInterval(callback, delay));
  const cleanup = () => timers.forEach(clearInterval);
  signal?.addEventListener("abort", cleanup, { once: true });
  root.innerHTML = `<section class="embed-card status-card" style="--accent:${config.accent}"><p class="embed-label">${escapeHtml(config.title)}</p><div class="status-line"><span class="status-dot"></span><strong>正在检测…</strong></div><p class="status-time"></p></section>`;
  const card = root.querySelector(".status-card");
  const label = root.querySelector(".status-line strong");
  const time = root.querySelector(".status-time");
  const update = async () => {
    try {
      const response = await fetch("/api/health", { cache: "no-store", signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (signal?.aborted) return;
      card.dataset.status = "ready";
      label.textContent = "运行正常";
      time.textContent = `更新时间：${new Date(data.time).toLocaleString("zh-CN")}`;
    } catch {
      if (signal?.aborted) return;
      card.dataset.status = "error";
      label.textContent = "暂时无法连接";
      time.textContent = `检测时间：${new Date().toLocaleString("zh-CN")}`;
    }
  };
  update();
  repeat(update, Number(config.refresh) * 1000);
  return { destroy() { cleanup(); signal?.removeEventListener("abort", cleanup); } };
}
