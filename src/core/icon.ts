import { iconSchema } from "./schema/icon.schema.js";
import type { WidgetIcon } from "./schema/icon.schema.js";

const FALLBACK = "◷";

// 嵌入页（DOM 版）图标渲染：图片图标统一走 <img>，加载失败回退占位符
export function createWidgetIcon(icon: WidgetIcon): HTMLElement {
  const container = document.createElement("span");
  container.className = "widget-icon";

  // widgetMetadata 会把本地 ./ 路径解析为 /widgets/<id>/ 绝对路径，属于受信运行时路径
  const trustedRuntimePath =
    typeof icon === "object" &&
    icon.type === "image" &&
    /^\/widgets\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_./-]+$/.test(icon.src) &&
    !icon.src.includes("..");

  if (!trustedRuntimePath) {
    try {
      iconSchema.parse(icon);
    } catch {
      container.textContent = FALLBACK;
      return container;
    }
  }

  const image = document.createElement("img");
  image.alt = icon.alt ?? "";
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener(
    "error",
    () => {
      container.textContent = icon.fallback || FALLBACK;
    },
    { once: true },
  );
  image.src = icon.src;
  container.append(image);
  return container;
}
