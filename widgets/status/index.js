import "../shared.css";
import "./style.css";
import { escapeHtml, sharedFields } from "../shared.js";

export const fields = [
  { key: "title", label: "标题", type: "text", default: "服务状态" },
  { key: "refresh", label: "刷新间隔（秒）", type: "number", default: "30", min: 5, max: 300, step: 5 },
  ...sharedFields,
];

export function render(root, config) {
  root.innerHTML = `<section class="embed-card status-card" style="--accent:${config.accent}"><p class="embed-label">${escapeHtml(config.title)}</p><div class="status-line"><span class="status-dot"></span><strong>正在检测…</strong></div><p class="status-time"></p></section>`;
  const card = root.querySelector(".status-card");
  const label = root.querySelector(".status-line strong");
  const time = root.querySelector(".status-time");
  const update = async () => {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      card.dataset.status = "ready";
      label.textContent = "运行正常";
      time.textContent = `更新时间：${new Date(data.time).toLocaleString("zh-CN")}`;
    } catch {
      card.dataset.status = "error";
      label.textContent = "暂时无法连接";
      time.textContent = `检测时间：${new Date().toLocaleString("zh-CN")}`;
    }
  };
  update();
  setInterval(update, Number(config.refresh) * 1000);
}
