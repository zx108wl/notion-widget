import { createAsyncCache } from "../async-cache.js";
import { defaultControl } from "../control-policy.js";
const cache = createAsyncCache();
const loaders = { input: () => import("./input.js"), slider: () => import("./slider.js"), select: () => import("./select.js"), radio: () => import("./radio.js"), switch: () => import("./switch.js") };
export function loadBuiltIn(type) {
  if (!loaders[type]) return Promise.reject(new Error("Unknown control: " + type));
  return cache.get("builtin:" + type, loaders[type]);
}
export async function loadControl(field, configUrl, stylesheetLoader, signal) {
  const type = field.control?.type ?? defaultControl(field);
  if (type !== "custom") return loadBuiltIn(type);
  const href = new URL(field.control.entry, new URL(configUrl, window.location.origin)).href;
  const module = await cache.get(href, () => import(/* @vite-ignore */ href));
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const selected = field.control.export ? module[field.control.export] : module;
  if (typeof selected?.mount !== "function") throw new Error("Custom control must export mount");
  await Promise.all((field.control.css || []).map(value => stylesheetLoader(new URL(value, new URL(configUrl, window.location.origin)).href)));
  return selected;
}
export async function mountControl(root, context, configUrl, stylesheetLoader, onWarning) {
  if (context.signal.aborted) return null;
  let instance, local = new AbortController();
  const abort = () => local.abort();
  context.signal.addEventListener("abort", abort, { once: true });
  const scoped = () => ({ ...context, signal: local.signal });
  const cleanup = () => { local.abort(); context.signal.removeEventListener("abort", abort); try { instance?.destroy?.(); } finally { root.replaceChildren(); } };
  try {
    try {
      const module = await loadControl(context.field, configUrl, stylesheetLoader, context.signal);
      if (context.signal.aborted) { cleanup(); return null; }
      instance = await module.mount(root, scoped());
      if (!instance || typeof instance.setValue !== "function" || typeof instance.destroy !== "function") throw new Error("Control must return setValue and destroy");
    } catch (error) {
      local.abort();
      try { instance?.destroy?.(); } catch { /* Continue with default control. */ }
      instance = null;
      if (context.signal.aborted) { cleanup(); return null; }
      root.replaceChildren(); onWarning(error); local = new AbortController();
      const module = await loadBuiltIn(defaultControl(context.field));
      if (context.signal.aborted) { cleanup(); return null; }
      instance = await module.mount(root, scoped());
    }
    if (context.signal.aborted) { cleanup(); return null; }
    let destroyed = false;
    return { setValue(value) { if (!destroyed) instance.setValue(value); }, destroy() { if (destroyed) return; destroyed = true; cleanup(); } };
  } catch (error) { cleanup(); throw error; }
}
