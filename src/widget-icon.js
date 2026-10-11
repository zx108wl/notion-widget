import { validateIcon } from "./widget-config.js";

export function createWidgetIcon(icon) {
  const container = document.createElement("span");
  container.className = "widget-icon";
  // Manifest image URLs have already been resolved to site-root paths.
  if (icon?.type === "image" && typeof icon.src === "string" && /^\/widgets\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_./-]+$/.test(icon.src) && !icon.src.includes("..")) {
    return appendImage(container, icon);
  }
  try { validateIcon(icon); } catch { container.textContent = "◷"; return container; }
  if (typeof icon === "string" || icon.type === "text") {
    container.textContent = typeof icon === "string" ? icon : icon.value;
    return container;
  }
  return appendImage(container, icon);
}

function appendImage(container, icon) {
  const image = document.createElement("img");
  image.alt = icon.alt ?? "";
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => { container.textContent = icon.fallback || "◷"; }, { once: true });
  image.src = icon.src;
  container.append(image);
  return container;
}
