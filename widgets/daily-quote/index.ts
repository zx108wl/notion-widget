import "../shared.css";
import "./style.css";
import { escapeHtml } from "../shared.js";
import type { WidgetRenderOptions } from "../../src/core/runtime/index.js";

export interface DailyQuoteConfig {
  title: string;
  category: string;
  backgroundCategory: string;
  width: string;
  height: string;
}

const HITOKOTO_ENDPOINT = "https://v1.hitokoto.cn/";
const WALLPAPER_ENDPOINT = "https://wp.upx8.com/api.php";

interface HitokotoResponse {
  hitokoto?: unknown;
  from?: unknown;
  from_who?: unknown;
  uuid?: unknown;
}

function hitokotoUrl(category: string): string {
  const params = new URLSearchParams();
  if (category && category !== "all") params.set("c", category);
  return `${HITOKOTO_ENDPOINT}?${params}`;
}

// 每次都带时间戳参数：既避免浏览器缓存同一张图，也让壁纸 API 换一张随机图
function wallpaperUrl(category: string): string {
  const params = new URLSearchParams({
    resolution: "1920x1080",
    _: Date.now().toString(36),
  });
  if (category && category !== "all") params.set("category", category);
  return `${WALLPAPER_ENDPOINT}?${params}`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function render(root: HTMLElement, config: DailyQuoteConfig, options: WidgetRenderOptions) {
  const { signal } = options;
  let current: DailyQuoteConfig = { ...config };

  root.innerHTML = `<section class="embed-card quote-card">
    <header class="quote-head">
      <p class="embed-label">${escapeHtml(config.title)}</p>
      <button class="quote-refresh" type="button" title="换一句与背景" aria-label="换一句与背景">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <polyline points="21 3 21 9 15 9" />
        </svg>
      </button>
    </header>
    <div class="quote-body">
      <blockquote class="quote-text">正在取一句…</blockquote>
      <p class="quote-author"></p>
      <p class="quote-hint"></p>
    </div>
  </section>`;

  const card = root.querySelector<HTMLElement>(".quote-card")!;
  const label = root.querySelector<HTMLElement>(".embed-label")!;
  const refreshBtn = root.querySelector<HTMLButtonElement>(".quote-refresh")!;
  const quote = root.querySelector<HTMLElement>(".quote-text")!;
  const author = root.querySelector<HTMLElement>(".quote-author")!;
  const hint = root.querySelector<HTMLElement>(".quote-hint")!;

  // 代次守卫：分类切换会重发请求，旧请求的迟到结果直接丢弃
  let run = 0;

  // 背景按 cover 渲染：等比缩放到填满组件，超出部分居中裁剪，绝不拉伸
  const applyBackground = () => {
    const url = wallpaperUrl(current.backgroundCategory);
    card.style.backgroundImage = `linear-gradient(180deg, rgb(0 0 0 / 14%) 0%, rgb(0 0 0 / 62%) 100%), url("${url}")`;
    card.style.backgroundSize = "cover, cover";
    card.style.backgroundPosition = "center, center";
    card.style.backgroundRepeat = "no-repeat, no-repeat";
    card.style.backgroundColor = "#262524";
  };

  const setLoading = () => {
    card.classList.add("is-loading");
    card.classList.remove("is-error");
    refreshBtn.disabled = true;
    quote.textContent = "正在取一句…";
    author.textContent = "";
    hint.textContent = "";
    delete quote.dataset.uuid;
    quote.removeAttribute("title");
  };

  const setError = (message: string) => {
    card.classList.remove("is-loading");
    card.classList.add("is-error");
    refreshBtn.disabled = false;
    quote.textContent = "没能取到今天的句子";
    author.textContent = "";
    hint.textContent = message;
  };

  const load = async (runId: number) => {
    setLoading();
    try {
      const response = await fetch(hitokotoUrl(current.category), {
        signal: AbortSignal.timeout(12_000),
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as HitokotoResponse;
      if (signal.aborted || runId !== run) return;

      const content = text(data.hitokoto);
      if (!content) throw new Error("empty hitokoto");

      const fromWho = text(data.from_who);
      const from = text(data.from);
      const uuid = text(data.uuid);
      const attribution = fromWho && from ? `${fromWho}《${from}》` : fromWho || (from ? `《${from}》` : "");

      card.classList.remove("is-loading");
      card.classList.remove("is-error");
      refreshBtn.disabled = false;
      quote.textContent = content;
      author.textContent = attribution ? `— ${attribution}` : "";
      hint.textContent = "";
      if (uuid) {
        quote.dataset.uuid = uuid;
        quote.setAttribute("title", "点击查看这句话在「一言」的详情");
      }
    } catch (error) {
      if (signal.aborted || runId !== run) return;
      console.error(error);
      setError("句子服务暂时不可用，稍后刷新再试。");
    }
  };

  // 点击句子跳转到一言详情页（来源归属）
  quote.addEventListener("click", () => {
    const uuid = quote.dataset.uuid;
    if (!uuid) return;
    window.open(`https://hitokoto.cn/?uuid=${encodeURIComponent(uuid)}`, "_blank", "noopener,noreferrer");
  });

  // 点击刷新按钮：同时重取一言句子与背景图
  refreshBtn.addEventListener("click", () => {
    applyBackground();
    void load(++run);
  });

  applyBackground();
  void load(++run);

  return {
    // 参数热更新：只改受影响的局部（theme/width/height 由宿主在 render 之外处理）
    update(next: DailyQuoteConfig) {
      const prev = current;
      current = { ...next };
      if (prev.title !== current.title) label.textContent = current.title;
      if (prev.backgroundCategory !== current.backgroundCategory) applyBackground();
      if (prev.category !== current.category) void load(++run);
    },
    destroy() {
      run += 1;
    },
  };
}
