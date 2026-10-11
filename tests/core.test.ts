import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseParams, validateValue, validateValues } from "../src/core/validation/index.js";
import { validateConfig, resolveFields } from "../src/core/schema/widget-config.schema.js";
import { createAsyncCache } from "../src/core/cache/async-cache.js";
import { createRequestCache } from "../src/core/cache/request-cache.js";
import { createWidgetRuntime } from "../src/core/runtime/index.js";

const numberField = { key: "refresh", label: "刷新", type: "number", default: "30", min: 5, max: 300, step: 5 };

describe("strict URL errors preserve bad values and report unknown and duplicate parameters", () => {
  it("validates number fields", () => {
    for (const value of ["abc", "", "301", "6", "Infinity", "0x10"]) {
      assert.ok(validateValue(numberField as never, value));
    }
    assert.equal(validateValue(numberField as never, "30"), null);
    const parsed = parseParams([numberField as never], new URLSearchParams("refresh=abc&typo=1"));
    assert.equal(parsed.config.refresh, "abc");
    assert.equal(parsed.errors.length, 2);
    assert.match(parsed.errors[1].suggestion, /refresh/);
    assert.equal(parseParams([numberField as never], new URLSearchParams("refresh=30&refresh=35")).errors.length, 1);
    assert.equal(parseParams([numberField as never], new URLSearchParams()).config.refresh, "30");
    assert.equal(validateValue({ ...numberField, key: "width", default: "" } as never, ""), null);
    assert.ok(validateValue({ ...numberField, default: "", required: true } as never, ""));
  });
});

describe("shared text, choices, date and decimal validation", () => {
  it("validates text, select, checkbox, color, datetime", () => {
    const text = { key: "title", type: "text", default: "ABC", minLength: 2, maxLength: 5, pattern: "[A-Z]+" };
    for (const value of ["A", "abcdef", "abc"]) assert.ok(validateValue(text as never, value));
    assert.equal(validateValue(text as never, "ABC"), null);
    assert.ok(validateValue(text as never, ""));
    assert.equal(validateValue({ ...numberField, min: -90, max: 90, step: 0.0001 } as never, "31.2304"), null);
    assert.ok(validateValue({ key: "theme", type: "select", options: [{ value: "auto" }] } as never, "wrong"));
    assert.ok(validateValue({ key: "enabled", type: "checkbox" } as never, "true"));
    assert.ok(validateValue({ key: "color", type: "color" } as never, "red"));
    const date = { key: "date", type: "datetime-local", required: true };
    assert.equal(validateValue(date as never, "2026-10-17T12:30"), null);
    for (const value of ["2026-02-30T12:30", "bad", "2026-10-17T25:30", ""]) {
      assert.ok(validateValue(date as never, value));
    }
  });
});

describe("control policy rejects duplicated constraints and incompatible types", () => {
  it("validates config and control compatibility", async () => {
    const source = JSON.parse(
      await readFile(new URL("../widgets/status/config.json", import.meta.url), "utf8"),
    );
    validateConfig(source, "status");
    for (const control of [
      { type: "radio" },
      { type: "slider", min: 1 },
      { type: "custom", entry: "./../bad.js" },
    ]) {
      assert.throws(() =>
        validateConfig({ ...source, fields: [{ ...numberField, control }] }, "status"),
      );
    }
    assert.throws(() =>
      validateConfig({ ...source, fields: [{ ...numberField, default: "6" }] }, "status"),
    );
    const countdown = JSON.parse(
      await readFile(new URL("../widgets/countdown/config.json", import.meta.url), "utf8"),
    );
    assert.ok(resolveFields(countdown).find((field) => field.key === "target")!.default);
  });
});

describe("dynamic code loads coalesce and failed loads retry", () => {
  it("caches and retries", async () => {
    const cache = createAsyncCache();
    let calls = 0;
    const loader = async () => {
      calls++;
      return {};
    };
    const [first, second] = await Promise.all([cache.get("input", loader), cache.get("input", loader)]);
    assert.equal(first, second);
    assert.equal(calls, 1);
    await assert.rejects(cache.get("broken", async () => { throw new Error("network"); }));
    assert.equal(await cache.get("broken", async () => "recovered"), "recovered");
  });
});

describe("configuration requests share subscribers, abort orphaned requests and retain successful results", () => {
  it("handles abort and caching", async () => {
    let calls = 0, aborted = 0, complete: ((value: string) => void) | undefined;
    const cache = createRequestCache<string>((_key, signal) => {
      calls++;
      return new Promise((resolve, reject) => {
        complete = resolve;
        signal.addEventListener("abort", () => { aborted++; reject(new Error("aborted")); });
      });
    });
    const a = new AbortController(), b = new AbortController();
    const first = cache.get("clock", a.signal), second = cache.get("clock", b.signal);
    await Promise.resolve();
    a.abort();
    await assert.rejects(first, { name: "AbortError" });
    assert.equal(aborted, 0);
    complete!("config");
    assert.equal(await second, "config");
    assert.equal(await cache.get("clock"), "config");
    assert.equal(calls, 1);
    const c = new AbortController();
    const orphan = cache.get("other", c.signal);
    orphan.catch(() => {}); // 防止未处理拒绝
    await Promise.resolve();
    c.abort();
    await assert.rejects(orphan, { name: "AbortError" });
    assert.equal(aborted, 1);
    const retry = cache.get("other");
    await Promise.resolve();
    complete!("retry");
    assert.equal(await retry, "retry");
    assert.equal(calls, 3);
  });
});

describe("invalid config never requests code; rendering cleans old and pending instances", () => {
  it("runtime lifecycle", async () => {
    let loads = 0, renders = 0, destroys = 0;
    const signals: AbortSignal[] = [], errors: unknown[] = [];
    const runtime = createWidgetRuntime({
      root: { replaceChildren() {} } as unknown as Element,
      validate: (config) => (config.bad ? [{ reason: "invalid" }] : []),
      showErrors: (value) => errors.push(value),
      showFailure: (error) => { throw error; },
      loadModule: async () => {
        loads++;
        return {
          render(_root: Element, _config: Record<string, string>, { signal }: { signal: AbortSignal }) {
            renders++;
            signals.push(signal);
            return { destroy() { destroys++; } };
          },
        };
      },
    });
    await runtime.render({ bad: true } as never);
    assert.equal(loads, 0);
    assert.equal(errors.length, 1);
    await runtime.render({} as never);
    await runtime.render({} as never);
    assert.equal(renders, 2);
    assert.equal(destroys, 1);
    assert.ok(signals[0].aborted);
    runtime.destroy();
    assert.equal(destroys, 2);
    assert.ok(signals[1].aborted);
    await runtime.render({} as never);
    assert.equal(renders, 2);

    let ready: ((value: never) => void) | undefined;
    let staleRenders = 0;
    const pending = createWidgetRuntime({
      root: { replaceChildren() {} } as unknown as Element,
      validate: () => [],
      showErrors() {},
      showFailure() {},
      loadModule: () => new Promise((resolve) => { ready = resolve; }),
    });
    const mounted = pending.render({} as never);
    pending.destroy();
    ready!({ render() { staleRenders++; } } as never);
    await mounted;
    assert.equal(staleRenders, 0);
  });
});

describe("async widget updates are serialized, stale updates cancel and queued values coalesce", () => {
  it("serializes updates", async () => {
    let entered!: () => void, release!: () => void;
    const active = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const applied: number[] = [], updateSignals: AbortSignal[] = [];
    let destroys = 0;
    const runtime = createWidgetRuntime({
      root: { replaceChildren() {} } as unknown as Element,
      validate: () => [],
      showErrors() {},
      showFailure: (error) => { throw error; },
      loadModule: async () => ({
        render() {
          return {
            async update(config: Record<string, string>, { signal }: { signal: AbortSignal }) {
              updateSignals.push(signal);
              if (config.value === "1") { entered(); await gate; }
              if (!signal.aborted) applied.push(Number(config.value));
            },
            destroy() { destroys++; },
          };
        },
      }),
    });
    await runtime.render({ value: "0" });
    const first = runtime.render({ value: "1" });
    await active;
    const second = runtime.render({ value: "2" });
    const third = runtime.render({ value: "3" });
    release();
    await Promise.all([first, second, third]);
    assert.deepEqual(applied, [3]);
    assert.ok(updateSignals[0].aborted);
    assert.equal(destroys, 0);
    runtime.destroy();
    assert.equal(destroys, 1);
    assert.ok(updateSignals.at(-1)?.aborted);
  });
});

describe("validateValues", () => {
  it("returns errors for invalid values", () => {
    const fields = [numberField] as never;
    const errors = validateValues(fields, { refresh: "abc" });
    assert.equal(errors.length, 1);
    assert.equal(validateValues(fields, { refresh: "30" }).length, 0);
  });
});
