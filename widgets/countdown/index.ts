import "../shared.css";
import "./style.css";
import { escapeHtml } from "../shared.js";

export interface CountdownConfig {
  title: string;
  target: string;
  completed: string;
  width: string;
  height: string;
  theme: string;
  accent: string;
}

export function render(root: HTMLElement, config: CountdownConfig, { signal }: { signal?: AbortSignal } = {}) {
  const timers: ReturnType<typeof setInterval>[] = [];
  const repeat = (callback: () => void, delay: number) => timers.push(setInterval(callback, delay));
  const cleanup = () => timers.forEach(clearInterval);
  signal?.addEventListener("abort", cleanup, { once: true });

  root.innerHTML = `<section class="embed-card countdown-card" style="--accent:${config.accent}"><p class="embed-label">${escapeHtml(config.title)}</p><div class="countdown-grid">${["天", "小时", "分钟", "秒"].map((unit, index) => `<div><strong data-part="${index}">--</strong><span>${unit}</span></div>`).join("")}</div><p class="completed-message" hidden>${escapeHtml(config.completed)}</p></section>`;

  const parts = [...root.querySelectorAll<HTMLElement>("[data-part]")];
  const message = root.querySelector<HTMLElement>(".completed-message")!;
  const target = new Date(config.target).getTime();
  const update = () => {
    const remaining = Math.max(0, target - Date.now());
    const values = [
      Math.floor(remaining / 86_400_000),
      Math.floor((remaining / 3_600_000) % 24),
      Math.floor((remaining / 60_000) % 60),
      Math.floor((remaining / 1000) % 60),
    ];
    values.forEach((value, index) => {
      parts[index].textContent = String(value).padStart(2, "0");
    });
    message.hidden = remaining > 0;
  };
  update();
  repeat(update, 1000);

  return {
    destroy() {
      cleanup();
      signal?.removeEventListener("abort", cleanup);
    },
  };
}
