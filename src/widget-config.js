import { validateControl } from "./control-policy.js";
import { validateValue } from "./config-validation.js";
const types = new Set(["text", "number", "select", "checkbox", "color", "datetime-local"]);

export function validateConfig(config, widgetId) {
  if (config?.schemaVersion !== 1 || config.id !== widgetId || !Array.isArray(config.fields)) {
    throw new Error("Invalid widget config: " + widgetId);
  }
  for (const key of ["name", "summary", "description", "version"]) {
    if (typeof config[key] !== "string" || !config[key].trim()) throw new Error("Missing widget metadata: " + key);
  }
  validateIcon(config.icon);
  if (!isLocalAssetPath(config.entry?.js) || !config.entry.js.endsWith(".js") || !Array.isArray(config.entry.css) || config.entry.css.some(value => !isLocalAssetPath(value) || !value.endsWith(".css"))) throw new Error("Invalid widget entry: " + widgetId);
  const keys = new Set();
  for (const field of config.fields) {
    if (!field || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field.key) || keys.has(field.key) || typeof field.label !== "string" || !types.has(field.type) || typeof field.default !== "string") {
      throw new Error("Invalid or duplicate config field: " + field?.key);
    }
    keys.add(field.key);
    validateControl(field);
    for (const key of ["min", "max", "step"]) if (field[key] !== undefined && field.type !== "number") throw new Error("Numeric constraint on non-number field: " + field.key);
    for (const key of ["minLength", "maxLength", "pattern", "patternMessage"]) if (field[key] !== undefined && field.type !== "text") throw new Error("Text constraint on non-text field: " + field.key);
    if (field.patternMessage !== undefined && typeof field.patternMessage !== "string") throw new Error("Invalid pattern message: " + field.key);
    for (const key of ["minLength", "maxLength"]) if (field[key] !== undefined && (!Number.isInteger(field[key]) || field[key] < 0)) throw new Error("Invalid length constraint: " + field.key);
    if ((field.minLength ?? 0) > (field.maxLength ?? 120)) throw new Error("Invalid length range: " + field.key);
    if (field.required !== undefined && typeof field.required !== "boolean") throw new Error("Invalid required flag: " + field.key);
    if (field.pattern !== undefined) { if (typeof field.pattern !== "string") throw new Error("Invalid pattern: " + field.key); new RegExp("^(?:" + field.pattern + ")$", "u"); }
    if (field.type === "select" && (!Array.isArray(field.options) || !field.options.length || field.options.some(o => typeof o?.value !== "string" || typeof o.label !== "string") || new Set(field.options.map(o => o.value)).size !== field.options.length || !field.options.some(o => o.value === field.default))) {
      throw new Error("Invalid select options: " + field.key);
    }
    for (const key of ["min", "max", "step"]) {
      if (field[key] !== undefined && (typeof field[key] !== "number" || !Number.isFinite(field[key]))) throw new Error("Invalid numeric constraint: " + field.key);
    }
    if ((field.min !== undefined && field.max !== undefined && field.min > field.max) || (field.step !== undefined && field.step <= 0)) throw new Error("Invalid numeric range: " + field.key);
    if (field.type === "number" && field.default !== "" && (!Number.isFinite(Number(field.default)) || Number(field.default) < (field.min ?? -Infinity) || Number(field.default) > (field.max ?? Infinity))) throw new Error("Invalid number default: " + field.key);
    if (field.type === "checkbox" && !["0", "1"].includes(field.default)) throw new Error("Invalid checkbox default: " + field.key);
    if (field.type === "color" && !/^#[0-9a-f]{6}$/i.test(field.default)) throw new Error("Invalid color default: " + field.key);
    if (field.defaultValue !== undefined && (!field.defaultValue || field.type !== "datetime-local" || field.defaultValue.kind !== "relative-date" || !Number.isFinite(field.defaultValue.days) || Math.abs(field.defaultValue.days) > 36500)) throw new Error("Invalid dynamic default: " + field.key);
  }
  for (const field of config.fields) {
    if (!field.defaultValue && validateValue(field, field.default)) throw new Error("Invalid default value: " + field.key);
  }
  return config;
}

export function resolveFields(config, widgetId, now = new Date()) {
  validateConfig(config, widgetId);
  return config.fields.map(field => {
    if (!field.defaultValue) return { ...field };
    const date = new Date(now);
    date.setDate(date.getDate() + field.defaultValue.days);
    date.setSeconds(0, 0);
    const value = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    return { ...field, default: value };
  });
}

export function widgetMetadata(config, configUrl) {
  const { id, name, icon, summary, description, version } = config;
  const resolvedIcon = icon?.type === "image" && isLocalAssetPath(icon.src) && configUrl
    ? { ...icon, src: new URL(icon.src, new URL(configUrl, "https://widget.invalid")).pathname }
    : icon;
  return { id, name, icon: resolvedIcon, summary, description, version };
}

export function isLocalAssetPath(value) {
  return typeof value === "string" && /^\.\/[a-zA-Z0-9_./-]+$/.test(value) && !value.slice(2).split("/").some(part => !part || part === "." || part === "..");
}

export function validateIcon(icon) {
  if (typeof icon === "string" && icon.trim()) return icon;
  if (!icon || typeof icon !== "object" || Array.isArray(icon)) throw new Error("Invalid widget icon");
  if (icon.type === "text" && typeof icon.value === "string" && icon.value.trim()) return icon;
  if (icon.type !== "image" || typeof icon.src !== "string") throw new Error("Invalid widget icon type or source");
  for (const key of ["alt", "fallback"]) {
    if (icon[key] !== undefined && typeof icon[key] !== "string") throw new Error("Invalid icon " + key);
  }
  if (isLocalAssetPath(icon.src) && /\.(png|jpe?g|gif|webp|avif|svg|ico)$/i.test(icon.src)) return icon;
  try {
    const url = new URL(icon.src);
    if (/^https?:\/\//i.test(icon.src) && ["http:", "https:"].includes(url.protocol)) return icon;
  } catch { /* Report a consistent validation error below. */ }
  throw new Error("Icon must use a local image path or HTTP(S) URL");
}
