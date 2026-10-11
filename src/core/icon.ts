import { iconSchema } from "./schema/icon.schema.js";
import type { WidgetIcon } from "./schema/icon.schema.js";

export function escapeHtml(value: string): string {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] as string);
}

export function createWidgetIcon(icon: WidgetIcon): HTMLElement {
  const container = document.createElement("span");
  container.className = "widget-icon";

  if (
    typeof icon === "object" &&
    icon.type === "image" &&
    typeof icon.src === "string" &&
    /^\/widgets\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_./-]+$/.test(icon.src) &&
    !icon.src.includes("..")
  ) {
    return appendImage(container, icon);
  }

  try {
    iconSchema.parse(icon);
  } catch {
    container.textContent = "◷";
    return container;
  }

  if (typeof icon === "string" || icon.type === "text") {
    container.textContent = typeof icon === "string" ? icon : icon.value;
    return container;
  }

  return appendImage(container, icon);
}

function appendImage(container: HTMLElement, icon: Extract<WidgetIcon, { type: "image" }>): HTMLElement {
  const image = document.createElement("img");
  image.alt = icon.alt ?? "";
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener(
    "error",
    () => {
      container.textContent = icon.fallback || "◷";
    },
    { once: true },
  );
  image.src = icon.src;
  container.append(image);
  return container;
}
