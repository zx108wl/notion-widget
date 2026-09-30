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
  { key: "latitude", label: "天气纬度", type: "number", default: "31.2304", min: -90, max: 90, step: 0.0001 },
  { key: "longitude", label: "天气经度", type: "number", default: "121.4737", min: -180, max: 180, step: 0.0001 },
  ...sharedFields,
];

export function render(root, config) {
  root.innerHTML = `<section class="embed-card clock-card" style="--accent:${config.accent}">
    <div class="clock-main"><p class="embed-label">${escapeHtml(config.title)}</p><time class="clock-time"></time><p class="clock-date"></p></div>
    <aside class="clock-weather" aria-live="polite">
      <span class="weather-icon" aria-hidden="true">·</span>
      <strong class="weather-temperature">--°</strong>
      <span class="weather-condition">正在获取天气</span>
    </aside>
  </section>`;
  const time = root.querySelector(".clock-time");
  const date = root.querySelector(".clock-date");
  const update = () => {
    const now = new Date();
    time.textContent = now.toLocaleTimeString("zh-CN", { timeZone: config.timezone, hour: "2-digit", minute: "2-digit", second: config.seconds === "1" ? "2-digit" : undefined, hour12: config.hour12 === "1" });
    date.textContent = now.toLocaleDateString("zh-CN", { timeZone: config.timezone, year: "numeric", month: "long", day: "numeric", weekday: "long" });
  };
  update();
  setInterval(update, config.seconds === "1" ? 1000 : 30_000);

  const weather = root.querySelector(".clock-weather");
  const updateWeather = async () => {
    try {
      const params = new URLSearchParams({ latitude: config.latitude, longitude: config.longitude });
      const response = await fetch(`/api/weather?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "天气请求失败");
      const details = describeWeather(data.weatherCode, data.isDay);
      weather.querySelector(".weather-icon").textContent = details.icon;
      weather.querySelector(".weather-temperature").textContent = `${Math.round(data.temperature)}${data.unit}`;
      weather.querySelector(".weather-condition").textContent = details.label;
    } catch (error) {
      console.error(error);
      weather.querySelector(".weather-icon").textContent = "—";
      weather.querySelector(".weather-temperature").textContent = "--°";
      weather.querySelector(".weather-condition").textContent = "天气暂不可用";
    }
  };
  updateWeather();
  setInterval(updateWeather, 15 * 60_000);
}

function describeWeather(code, isDay) {
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
