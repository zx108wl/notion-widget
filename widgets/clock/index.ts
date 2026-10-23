import "../shared.css";
import "./style.css";
import { escapeHtml } from "../shared.js";
import type { WidgetRenderOptions } from "../../src/core/runtime/index.js";

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

export function render(root: HTMLElement, config: ClockConfig, options: WidgetRenderOptions) {
  const { signal, authToken } = options;
  // 接口声明了 auth: "token"：带上嵌入令牌（Bearer）。
  // 工作台同源预览没有 token，改由会话 Cookie 放行，故这里无 token 时不带任何凭据。
  const authHeaders: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  // 当前生效配置：update() 与其做 diff，实现参数热更新而不重建 DOM / 不重拉天气
  let current: ClockConfig = { ...config };

  root.innerHTML = `<section class="embed-card clock-card" style="--accent:${config.accent}">
    <div class="clock-main"><p class="embed-label">${escapeHtml(config.title)}</p><time class="clock-time"></time><p class="clock-date"></p></div>
    <aside class="clock-weather" aria-live="polite">
      <span class="weather-icon" aria-hidden="true">·</span>
      <strong class="weather-temperature">--°</strong>
      <span class="weather-condition">正在获取天气</span>
    </aside>
  </section>`;

  const card = root.querySelector<HTMLElement>(".clock-card")!;
  const label = root.querySelector<HTMLElement>(".embed-label")!;
  const time = root.querySelector<HTMLElement>(".clock-time")!;
  const date = root.querySelector<HTMLElement>(".clock-date")!;
  const weather = root.querySelector<HTMLElement>(".clock-weather")!;

  // 定时器按用途命名，update() 只重启受影响的那一个
  const timers: Partial<Record<"clock" | "weather", ReturnType<typeof setInterval>>> = {};
  const repeat = (key: "clock" | "weather", callback: () => void, delay: number) => {
    const existing = timers[key];
    if (existing) clearInterval(existing);
    timers[key] = setInterval(callback, delay);
  };
  const cleanup = () => Object.values(timers).forEach((timer) => timer && clearInterval(timer));
  signal?.addEventListener("abort", cleanup, { once: true });

  const updateClockFace = () => {
    const now = new Date();
    time.textContent = now.toLocaleTimeString("zh-CN", {
      timeZone: current.timezone,
      hour: "2-digit",
      minute: "2-digit",
      second: current.seconds === "1" ? "2-digit" : undefined,
      hour12: current.hour12 === "1",
    });
    date.textContent = now.toLocaleDateString("zh-CN", {
      timeZone: current.timezone,
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    });
  };
  const startClock = () => {
    updateClockFace();
    repeat("clock", updateClockFace, current.seconds === "1" ? 1000 : 30_000);
  };

  // 天气代次：经纬度变更重启轮询后，旧请求的迟到结果按代次丢弃
  let weatherRun = 0;
  const updateWeather = async (run: number) => {
    try {
      const params = new URLSearchParams({ latitude: current.latitude, longitude: current.longitude });
      // 生命周期 signal 不传给 fetch：热更新销毁实例时中断请求会在控制台产生 net::ERR_ABORTED 噪音，
      // 保留 aborted 守卫即可阻止过期实例写 DOM；但仍设超时上限，避免上游卡住导致天气区久留"正在获取天气"
      const response = await fetch(`/api/weather?${params}`, {
        signal: AbortSignal.timeout(5_000),
        headers: authHeaders,
      });
      const data = await response.json();
      if (signal?.aborted || run !== weatherRun) return;
      if (!response.ok) throw new Error(data.error || "天气请求失败");
      const details = describeWeather(data.weatherCode, data.isDay);
      weather.querySelector(".weather-icon")!.textContent = details.icon;
      weather.querySelector(".weather-temperature")!.textContent = `${Math.round(data.temperature)}${data.unit}`;
      weather.querySelector(".weather-condition")!.textContent = details.label;
    } catch (error) {
      if (signal?.aborted || run !== weatherRun) return;
      console.error(error);
      weather.querySelector(".weather-icon")!.textContent = "—";
      weather.querySelector(".weather-temperature")!.textContent = "--°";
      weather.querySelector(".weather-condition")!.textContent = "天气暂不可用";
    }
  };
  const startWeather = () => {
    const run = ++weatherRun;
    void updateWeather(run);
    repeat("weather", () => void updateWeather(run), 15 * 60_000);
  };

  startClock();
  startWeather();

  return {
    // 参数热更新：只改受影响的局部（theme/width/height 由宿主在 render 之外处理）
    update(next: ClockConfig) {
      const prev = current;
      current = { ...next };
      if (prev.title !== current.title) label.textContent = current.title;
      if (prev.accent !== current.accent) card.style.setProperty("--accent", current.accent);
      if (
        prev.timezone !== current.timezone ||
        prev.seconds !== current.seconds ||
        prev.hour12 !== current.hour12
      ) {
        startClock();
      }
      if (prev.latitude !== current.latitude || prev.longitude !== current.longitude) {
        startWeather();
      }
    },
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
