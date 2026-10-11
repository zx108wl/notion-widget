import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseParams, validateValue } from "../src/config-validation.js";
import { validateConfig, resolveFields } from "../src/widget-config.js";
import { createAsyncCache } from "../src/async-cache.js";
import { createRequestCache } from "../src/request-cache.js";
import { createWidgetRuntime } from "../src/widget-runtime.js";

const number = { key: "refresh", label: "刷新", type: "number", default: "30", min: 5, max: 300, step: 5 };
test("strict URL errors preserve bad values and report unknown and duplicate parameters", () => {
  for (const value of ["abc", "", "301", "6", "Infinity", "0x10"]) assert.ok(validateValue(number, value), value);
  assert.equal(validateValue(number, "30"), null);
  const parsed = parseParams([number], new URLSearchParams("refresh=abc&typo=1"));
  assert.equal(parsed.config.refresh, "abc");
  assert.equal(parsed.errors.length, 2);
  assert.match(parsed.errors[1].suggestion, /refresh/);
  assert.equal(parseParams([number], new URLSearchParams("refresh=30&refresh=35")).errors.length, 1);
  assert.equal(parseParams([number], new URLSearchParams()).config.refresh, "30");
  assert.equal(validateValue({ ...number, key: "width", default: "" }, ""), null);
  assert.ok(validateValue({ ...number, default: "", required: true }, ""));
});
test("shared text, choices, date and decimal validation", () => {
  const text = { key: "title", type: "text", default: "ABC", minLength: 2, maxLength: 5, pattern: "[A-Z]+" };
  for (const value of ["A", "abcdef", "abc"]) assert.ok(validateValue(text, value));
  assert.equal(validateValue(text, "ABC"), null);
  assert.ok(validateValue(text, ""));
  assert.equal(validateValue({ ...number, min: -90, max: 90, step: 0.0001 }, "31.2304"), null);
  assert.ok(validateValue({ key: "theme", type: "select", options: [{ value: "auto" }] }, "wrong"));
  assert.ok(validateValue({ key: "enabled", type: "checkbox" }, "true"));
  assert.ok(validateValue({ key: "color", type: "color" }, "red"));
  const date = { key: "date", type: "datetime-local", required: true };
  assert.equal(validateValue(date, "2026-10-17T12:30"), null);
  for (const value of ["2026-02-30T12:30", "bad", "2026-10-17T25:30", ""]) assert.ok(validateValue(date, value));
});
test("control policy rejects duplicated constraints and incompatible types", async () => {
  const source = JSON.parse(await readFile(new URL("../widgets/status/config.json", import.meta.url), "utf8"));
  validateConfig(source, "status");
  for (const control of [{ type: "radio" }, { type: "slider", min: 1 }, { type: "custom", entry: "./../bad.js" }]) {
    assert.throws(() => validateConfig({ ...source, fields: [{ ...number, control }] }, "status"));
  }
  assert.throws(() => validateConfig({ ...source, fields: [{ ...number, default: "6" }] }, "status"));
  const countdown = JSON.parse(await readFile(new URL("../widgets/countdown/config.json", import.meta.url), "utf8"));
  assert.ok(resolveFields(countdown, "countdown").find(field => field.key === "target").default);
});
test("dynamic code loads coalesce and failed loads retry", async () => {
  const cache = createAsyncCache(); let calls = 0;
  const loader = async () => { calls++; return {}; };
  const [first, second] = await Promise.all([cache.get("input", loader), cache.get("input", loader)]);
  assert.equal(first, second); assert.equal(calls, 1);
  await assert.rejects(cache.get("broken", async () => { throw new Error("network"); }));
  assert.equal(await cache.get("broken", async () => "recovered"), "recovered");
});
test("configuration requests share subscribers, abort orphaned requests and retain successful results", async () => {
  let calls = 0, aborted = 0, complete;
  const cache = createRequestCache((_key, signal) => { calls++; return new Promise((resolve, reject) => { complete = resolve; signal.addEventListener("abort", () => { aborted++; reject(new Error("aborted")); }); }); });
  const a = new AbortController(), b = new AbortController();
  const first = cache.get("clock", a.signal), second = cache.get("clock", b.signal);
  await Promise.resolve(); a.abort(); await assert.rejects(first, { name: "AbortError" });
  assert.equal(aborted, 0); complete("config"); assert.equal(await second, "config");
  assert.equal(await cache.get("clock"), "config"); assert.equal(calls, 1);
  const c = new AbortController(); const orphan = cache.get("other", c.signal); await Promise.resolve(); c.abort(); await assert.rejects(orphan); assert.equal(aborted, 1);
  const retry = cache.get("other"); await Promise.resolve(); complete("retry"); assert.equal(await retry, "retry"); assert.equal(calls, 3);
});
test("invalid config never requests code; rendering cleans old and pending instances", async () => {
  let loads = 0, renders = 0, destroys = 0; const signals = [], errors = [];
  const runtime = createWidgetRuntime({ root: { replaceChildren() {} }, validate: config => config.bad ? ["invalid"] : [], showErrors: value => errors.push(value), showFailure: error => { throw error; }, loadModule: async () => { loads++; return { render(_root, _config, { signal }) { renders++; signals.push(signal); return { destroy() { destroys++; } }; } }; } });
  await runtime.render({ bad: true }); assert.equal(loads, 0); assert.equal(errors.length, 1);
  await runtime.render({}); await runtime.render({}); assert.equal(renders, 2); assert.equal(destroys, 1); assert.ok(signals[0].aborted);
  runtime.destroy(); assert.equal(destroys, 2); assert.ok(signals[1].aborted); await runtime.render({}); assert.equal(renders, 2);
  let ready, staleRenders = 0;
  const pending = createWidgetRuntime({ root: { replaceChildren() {} }, validate: () => [], showErrors() {}, showFailure() {}, loadModule: () => new Promise(resolve => { ready = resolve; }) });
  const mounted = pending.render({}); pending.destroy(); ready({ render() { staleRenders++; } }); await mounted; assert.equal(staleRenders, 0);
});

test("custom control failure aborts partial listeners and falls back; stale async mounts are destroyed", async () => {
  const { mountControl } = await import("../src/controls/index.js");
  const originalDocument = globalThis.document, originalWindow = globalThis.window;
  class Element extends EventTarget { constructor() { super(); this.children = []; } append(...children) { this.children.push(...children); } replaceChildren() { this.children = []; } setAttribute() {} }
  globalThis.document = { createElement: () => new Element() }; globalThis.window = { location: { origin: "https://test.invalid" } };
  const field = { key: "value", label: "Value", type: "text", default: "ok", control: { type: "custom", entry: "data:text/javascript," + encodeURIComponent('export function mount(root, context) { globalThis.partialSignal = context.signal; throw new Error("failed mount"); }') } };
  const root = new Element(), controller = new AbortController(); let warnings = 0, changes = 0;
  try {
    const instance = await mountControl(root, { field, value: "ok", signal: controller.signal, onChange() { changes++; } }, "/widgets/test/config.json", async () => {}, () => { warnings++; });
    assert.equal(warnings, 1); assert.ok(globalThis.partialSignal.aborted); assert.equal(root.children.length, 1);
    const input = root.children[0]; input.value = "changed"; input.dispatchEvent(new Event("input")); assert.equal(changes, 1);
    instance.setValue("new"); assert.equal(input.value, "new"); instance.destroy(); instance.destroy(); input.dispatchEvent(new Event("input")); assert.equal(changes, 1);
    let release, entered;
    globalThis.mountGate = new Promise(resolve => { release = resolve; }); globalThis.mountEntered = new Promise(resolve => { entered = resolve; }); globalThis.onMountEntered = entered; globalThis.staleDestroyed = 0;
    const slow = { ...field, control: { type: "custom", entry: "data:text/javascript," + encodeURIComponent('export async function mount() { globalThis.onMountEntered(); await globalThis.mountGate; return { setValue() {}, destroy() { globalThis.staleDestroyed++; } }; }') } };
    const staleController = new AbortController();
    const mounting = mountControl(root, { field: slow, value: "ok", signal: staleController.signal, onChange() {} }, "/widgets/test/config.json", async () => {}, () => {});
    await globalThis.mountEntered; staleController.abort(); release(); assert.equal(await mounting, null); assert.equal(globalThis.staleDestroyed, 1);
  } finally {
    for (const key of ["partialSignal", "mountGate", "mountEntered", "onMountEntered", "staleDestroyed"]) delete globalThis[key];
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
  }
});

test("async widget updates are serialized, stale updates cancel and queued values coalesce", async () => {
  let entered, release; const active = new Promise(resolve => { entered = resolve; }); const gate = new Promise(resolve => { release = resolve; });
  const applied = [], updateSignals = []; let destroys = 0;
  const runtime = createWidgetRuntime({ root: { replaceChildren() {} }, validate: () => [], showErrors() {}, showFailure(error) { throw error; }, loadModule: async () => ({ render() { return { async update(config, { signal }) { updateSignals.push(signal); if (config.value === 1) { entered(); await gate; } if (!signal.aborted) applied.push(config.value); }, destroy() { destroys++; } }; } }) });
  await runtime.render({ value: 0 });
  const first = runtime.render({ value: 1 }); await active;
  const second = runtime.render({ value: 2 }); const third = runtime.render({ value: 3 });
  release(); await Promise.all([first, second, third]);
  assert.deepEqual(applied, [3]); assert.ok(updateSignals[0].aborted); assert.equal(destroys, 0);
  runtime.destroy(); assert.equal(destroys, 1); assert.ok(updateSignals.at(-1).aborted);
});

test("a canceled old update does not block updates of a newly rendered instance", async () => {
  let entered, release, mounts = 0;
  const active = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const applied = [];
  const runtime = createWidgetRuntime({ root: { replaceChildren() {} }, validate: config => config.bad ? ["bad"] : [], showErrors() {}, showFailure(error) { throw error; }, loadModule: async () => ({ render() { const mount = ++mounts; return { async update(config) { if (mount === 1) { entered(); await gate; } else applied.push(config.value); }, destroy() {} }; } }) });
  await runtime.render({ value: 0 }); const old = runtime.render({ value: 1 }); await active;
  await runtime.render({ bad: true }); await runtime.render({ value: 2 }); await runtime.render({ value: 3 });
  assert.deepEqual(applied, [3]); release(); await old; runtime.destroy();
});
