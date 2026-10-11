import "../shared.css";
import "./style.css";
import { escapeHtml } from "../shared.js";

export interface ClockConfig {
  title: string;
  timezone: string;
  seconds: string;
  hour12: string;
  latitude: string;
  longitude: string;
  width: string;
  height: string;
  theme: string;
  accent: string;
}

export function render(root: HTMLElement, config: ClockConfig, { signal }: { signal?: AbortSignal } = {}) {
  const timers: ReturnType<typeof setInterval>[] = [];
  const repeat = (callback: () => void, delay: number) => timers.push(setInterval(callback, delay));
  const cleanup = () => timers.forEach(clearInterval);
  signal?.addEventListener("abort", cleanup, { once: true });

  root.innerHTML = `<section class="embed-card clock-card" style="--accent:${config.accent}">
    <div class="clock-main"><p class="embed-label">${escapeHtml(config.title)}</p><time class="clock-time"></time><p class="clock-date"></p></div>
    <aside class="clock-weather" aria-live="polite">
      <span class="weather-icon" aria-hidden="true">·</span>
      <strong class="weather-temperature">--°</strong>
      <span class="weather-condition">正在获取天气</span>
    </aside>
  </section>`;

  const time = root.querySelector(".clock-time")!;
  const date = root.querySelector(".clock-date")!;
  const update = () => {
    const now = new Date();
    time.textContent = now.toLocaleTimeString("zh-CN", {
      timeZone: config.timezone,
      hour: "2-digit",
      minute: "2-digit",
      second: config.seconds === "1" ? "2-digit" : undefined,
      hour12: config.hour12 === "1",
    });
    date.textContent = now.toLocaleDateString("zh-CN", {
      timeZone: config.timezone,
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    });
  };
  update();
  repeat(update, config.seconds === "1" ? 1000 : 30_000);

  const weather = root.querySelector(".clock-weather")!;
  const updateWeather = async () => {
    try {
      const params = new URLSearchParams({ latitude: config.latitude, longitude: config.longitude });
      const response = await fetch(`/api/weather?${params}`, { signal });
      const data = await response.json();
      if (signal?.aborted) return;
      if (!response.ok) throw new Error(data.error || "天气请求失败");
      const details = describeWeather(data.weatherCode, data.isDay);
      weather.querySelector(".weather-icon")!.textContent = details.icon;
      weather.querySelector(".weather-temperature")!.textContent = `${Math.round(data.temperature)}${data.unit}`;
      weather.querySelector(".weather-condition")!.textContent = details.label;
    } catch (error) {
      if (signal?.aborted) return;
      console.error(error);
      weather.querySelector(".weather-icon")!.textContent = "—";
      weather.querySelector(".weather-temperature")!.textContent = "--°";
      weather.querySelector(".weather-condition")!.textContent = "天气暂不可用";
    }
  };
  updateWeather();
  repeat(updateWeather, 15 * 60_000);

  return {
    destroy() {
      cleanup();
      signal?.removeEventListener("abort", cleanup);
    },
  };
}

function describeWeather(code: number, isDay: boolean): { icon: string; label: string } {
  if (code === 0) return { icon: isDay ? "☀️" : "🌙", label: "晴" };
  if ([1, 2].includes(code)) return { icon: isDay ? "🌤️" : "☁️", label: "多云" };
  if (code === 3) return { icon: "☁️", label: "阴" };
  if ([45, 48].includes(code)) return { icon: "🌫️", label: "雾" };
  if ([51, 53, 55, 56, 57].includes(code)) return { icon: "🌦️", label: "毛毛雨" };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: "🌧️", label: "雨" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: "🌨️", label: "雪" };
  if ([95, 96, 99].includes(code)) return { icon: "⛈️", label: "雷雨" };
  return { icon: "🌡️", label: "天气" };
}
