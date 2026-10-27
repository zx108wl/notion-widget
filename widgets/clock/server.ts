import type { WidgetRouteHandler } from "../../src/core/server/plugin-server.js";
import { parseCoordinate } from "../shared.js";

// 天气接口从平台核心迁入 clock 插件自带的服务端模块。
// 契约：响应体、错误体、缓存头、超时与状态码与迁移前逐字段一致（前端 widgets/clock/index.ts 一行不改）。

const weatherCache = new Map<string, { data: unknown; expiresAt: number }>();

const handlers: Record<string, WidgetRouteHandler> = {
  "GET /api/weather": async (request, response) => {
    const latitude = parseCoordinate(String(request.query.latitude ?? ""));
    const longitude = parseCoordinate(String(request.query.longitude ?? ""));
    if (
      latitude === null ||
      longitude === null ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return response.status(400).json({ error: "请输入有效的经纬度（支持十进制或度分秒）" });
    }

    const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    const cached = weatherCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      response.set("Cache-Control", "public, max-age=300");
      return response.json(cached.data);
    }

    try {
      const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
      forecastUrl.search = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current: "temperature_2m,apparent_temperature,weather_code,is_day",
        timezone: "auto",
      }).toString();
      const forecastResponse = await fetch(forecastUrl, { signal: AbortSignal.timeout(5_000) });
      if (!forecastResponse.ok) throw new Error(`天气服务返回 HTTP ${forecastResponse.status}`);
      const forecast = await forecastResponse.json();
      if (!forecast.current) throw new Error("天气服务没有返回当前数据");

      const data = {
        latitude,
        longitude,
        temperature: forecast.current.temperature_2m,
        apparentTemperature: forecast.current.apparent_temperature,
        weatherCode: forecast.current.weather_code,
        isDay: forecast.current.is_day === 1,
        unit: forecast.current_units?.temperature_2m || "°C",
        observedAt: forecast.current.time,
      };
      weatherCache.set(cacheKey, { data, expiresAt: Date.now() + 10 * 60_000 });
      response.set("Cache-Control", "public, max-age=300");
      return response.json(data);
    } catch (error) {
      return response.status(502).json({
        error: "天气服务请求失败",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
};

export const routes = handlers;
