import "dotenv/config";
import express from "express";

const app = express();
const port = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (_request, response) => {
  response.set("Cache-Control", "no-store");
  response.json({ ok: true, time: new Date().toISOString() });
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

