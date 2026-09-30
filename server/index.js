import "dotenv/config";
import express from "express";

const app = express();
const port = Number(process.env.PORT || 3000);
const weatherCache = new Map();

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (_request, response) => {
  response.set("Cache-Control", "no-store");
  response.json({ ok: true, time: new Date().toISOString() });
});

app.get("/api/weather", async (request, response) => {
  const latitude = Number(request.query.latitude);
  const longitude = Number(request.query.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return response.status(400).json({ error: "请输入有效的经纬度" });
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
    });
    const forecastResponse = await fetch(forecastUrl, { signal: AbortSignal.timeout(8_000) });
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
});

app.get("/api/notion/page", async (_request, response) => {
  const token = process.env.NOTION_TOKEN;
  const pageId = process.env.NOTION_PAGE_ID;

  if (!token || !pageId) {
    return response.status(503).json({
      error: "Notion API 尚未配置",
    });
  }

  try {
    const upstream = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": process.env.NOTION_VERSION || "2025-09-03",
      },
      signal: AbortSignal.timeout(10_000),
    });

    const data = await upstream.json();
    response.set("Cache-Control", "private, max-age=30");
    return response.status(upstream.status).json(data);
  } catch (error) {
    return response.status(502).json({
      error: "Notion API 请求失败",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.use((_request, response) => {
  response.status(404).json({ error: "Not found" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on port ${port}`);
});
