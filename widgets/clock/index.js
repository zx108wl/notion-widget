import "../shared.css";
import "./style.css";
import { escapeHtml, sharedFields } from "../shared.js";

export const fields = [
  { key: "title", label: "标题", type: "text", default: "今天" },
  {
    key: "timezone", label: "时区", type: "select", default: "Asia/Shanghai",
    options: [
      { value: "Asia/Shanghai", label: "上海（UTC+8）" },
      { value: "Asia/Tokyo", label: "东京（UTC+9）" },
      { value: "Europe/London", label: "伦敦" },
      { value: "America/New_York", label: "纽约" },
      { value: "UTC", label: "UTC" },
    ],
  },
  { key: "seconds", label: "显示秒钟", type: "checkbox", default: "1" },
  { key: "hour12", label: "使用 12 小时制", type: "checkbox", default: "0" },
  ...sharedFields,
];

export function render(root, config) {
  root.innerHTML = `<section class="embed-card clock-card" style="--accent:${config.accent}"><p class="embed-label">${escapeHtml(config.title)}</p><time class="clock-time"></time><p class="clock-date"></p></section>`;
  const time = root.querySelector(".clock-time");
  const date = root.querySelector(".clock-date");
  const update = () => {
    const now = new Date();
    time.textContent = now.toLocaleTimeString("zh-CN", { timeZone: config.timezone, hour: "2-digit", minute: "2-digit", second: config.seconds === "1" ? "2-digit" : undefined, hour12: config.hour12 === "1" });
    date.textContent = now.toLocaleDateString("zh-CN", { timeZone: config.timezone, year: "numeric", month: "long", day: "numeric", weekday: "long" });
  };
  update();
  setInterval(update, config.seconds === "1" ? 1000 : 30_000);
}
