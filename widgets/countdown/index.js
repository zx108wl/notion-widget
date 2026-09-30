import "../shared.css";
import "./style.css";
import { escapeHtml, sharedFields } from "../shared.js";

export const fields = [
  { key: "title", label: "事件名称", type: "text", default: "距离目标还有" },
  { key: "target", label: "目标时间", type: "datetime-local", default: defaultTarget() },
  { key: "completed", label: "结束提示", type: "text", default: "目标时间已到" },
  ...sharedFields,
];

export function render(root, config) {
  root.innerHTML = `<section class="embed-card countdown-card" style="--accent:${config.accent}"><p class="embed-label">${escapeHtml(config.title)}</p><div class="countdown-grid">${["天", "小时", "分钟", "秒"].map((unit, index) => `<div><strong data-part="${index}">--</strong><span>${unit}</span></div>`).join("")}</div><p class="completed-message" hidden>${escapeHtml(config.completed)}</p></section>`;
  const parts = [...root.querySelectorAll("[data-part]")];
  const message = root.querySelector(".completed-message");
  const target = new Date(config.target).getTime();
  const update = () => {
    const remaining = Math.max(0, target - Date.now());
    const values = [Math.floor(remaining / 86_400_000), Math.floor((remaining / 3_600_000) % 24), Math.floor((remaining / 60_000) % 60), Math.floor((remaining / 1000) % 60)];
    values.forEach((value, index) => { parts[index].textContent = String(value).padStart(2, "0"); });
    message.hidden = remaining > 0;
  };
  update();
  setInterval(update, 1000);
}

function defaultTarget() {
  const date = new Date(Date.now() + 7 * 86_400_000);
  date.setSeconds(0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
