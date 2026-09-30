import "./style.css";

const app = document.querySelector("#app");

app.innerHTML = `
  <section class="widget">
    <p class="eyebrow">NOTION WIDGET</p>
    <h1>环境已就绪</h1>
    <p id="status" class="status loading">正在连接 API…</p>
    <p id="time" class="time"></p>
  </section>
`;

const status = document.querySelector("#status");
const time = document.querySelector("#time");

async function loadHealth() {
  try {
    const response = await fetch("/api/health", {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    status.textContent = "前端、反向代理和 API 均正常";
    status.className = "status ready";
    time.textContent = new Date(data.time).toLocaleString("zh-CN");
  } catch (error) {
    status.textContent = `API 暂不可用：${error.message}`;
    status.className = "status error";
  }
}

loadHealth();

