import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateConfig, widgetMetadata } from "../src/core/schema/widget-config.schema.js";
import { iconSchema } from "../src/core/schema/icon.schema.js";
import { publishIcon } from "../scripts/widget-icon-assets.js";
import { createWidgetIcon } from "../src/core/icon.js";

describe("icon types, config validation and metadata URL resolution", () => {
  it("validates icons and resolves metadata", async () => {
    const config = JSON.parse(
      await readFile(new URL("../widgets/clock/config.json", import.meta.url), "utf8"),
    );
    for (const icon of [
      "👋",
      { type: "text", value: "◷" },
      { type: "image", src: "./assets/icon.svg" },
      { type: "image", src: "https://example.com/icon" },
      { type: "image", src: "http://example.com/icon.png" },
    ]) {
      validateConfig({ ...config, icon }, "clock");
    }
    for (const icon of [
      "",
      null,
      [],
      { type: "text", value: "" },
      { type: "lucide", name: "clock" },
      { type: "image", src: "./../icon.svg" },
      { type: "image", src: "./assets/icon.exe" },
      { type: "image", src: "javascript:alert(1)" },
      { type: "image", src: "data:image/svg+xml,x" },
      { type: "image", src: "//example.com/icon.png" },
      { type: "image", src: "https://example.com/icon.png", fallback: 1 },
    ]) {
      assert.throws(() => iconSchema.parse(icon));
    }
    const meta = widgetMetadata(config, "/widgets/clock/config.json").icon as { src: string };
    assert.equal(meta.src, "/widgets/clock/assets/icon.svg");
    assert.equal((config.icon as { src: string }).src, "./assets/icon.svg");
    const remote = { type: "image", src: "https://example.com/icon.png" };
    assert.deepEqual(widgetMetadata({ ...config, icon: remote }, "/widgets/clock/config.json").icon, remote);
  });
});

describe("local icons publish bytes with stable content hashes and preserve fallback", () => {
  it("publishes icons with content hash", async () => {
    const tempBase = path.resolve(os.tmpdir());
    const temp = await mkdtemp(path.join(tempBase, "widget-icon-test-"));
    assert.equal(path.dirname(path.resolve(temp)), tempBase);
    try {
      await writeFile(path.join(temp, "icon.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
      const icon = { type: "image", src: "./icon.svg", alt: "Clock", fallback: "◷" } as const;
      const outputDir = path.join(temp, "output");
      const first = await publishIcon(icon, temp, outputDir);
      const firstImg = first as { src: string; fallback: string };
      assert.match(firstImg.src, /^\.\/assets\/icon-[0-9a-f]{12}\.svg$/);
      assert.equal(firstImg.fallback, "◷");
      assert.equal(
        await readFile(path.join(outputDir, firstImg.src), "utf8"),
        await readFile(path.join(temp, "icon.svg"), "utf8"),
      );
      assert.deepEqual(await publishIcon(icon, temp, outputDir), first);
      await writeFile(path.join(temp, "icon.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><circle/></svg>');
      const second = (await publishIcon(icon, temp, outputDir)) as { src: string };
      assert.notEqual(second.src, firstImg.src);
      await assert.rejects(publishIcon({ type: "image", src: "./missing.png" }, temp, outputDir));
      const values: (string | { type: "text"; value: string } | { type: "image"; src: string })[] =
        ["◷", { type: "text", value: "👋" }, { type: "image", src: "https://example.com/icon.png" }];
      for (const value of values) {
        assert.deepEqual(await publishIcon(value, temp, outputDir), value);
      }
    } finally {
      assert.equal(path.dirname(path.resolve(temp)), tempBase);
      await rm(temp, { recursive: true, force: true });
    }
  });
});

describe("renderer uses text, image and fallback without interpreting HTML", () => {
  it("creates icon elements safely", () => {
    type MockNode = {
      tag: string;
      children: unknown[];
      listeners: Record<string, () => void>;
      append(child: unknown): void;
      addEventListener(name: string, fn: () => void): void;
      textContent: string;
    };
    const original = globalThis.document as Document | undefined;
    globalThis.document = {
      createElement(_tag: string) {
        const node: MockNode = {
          tag: _tag,
          children: [],
          listeners: {},
          append(child) { node.children.push(child); },
          addEventListener(name, fn) { node.listeners[name] = fn; },
          get textContent() { return (node as { _text?: string })._text ?? ""; },
          set textContent(value: string) { (node as { _text?: string })._text = value; node.children = []; },
        };
        return node as unknown as HTMLElement;
      },
    } as unknown as Document;
    try {
      assert.equal(createWidgetIcon("<b>◷</b>").textContent, "<b>◷</b>");
      assert.equal(createWidgetIcon({ type: "text", value: "👋" }).textContent, "👋");
      for (const src of ["/widgets/clock/assets/icon-a.svg", "https://example.com/icon.png"]) {
        const node = createWidgetIcon({ type: "image", src, alt: "Clock", fallback: "⌛" }) as unknown as MockNode;
        const image = node.children[0] as MockNode;
        assert.equal(image.tag, "img");
        assert.equal((image as unknown as { src?: string }).src, src);
        assert.equal((image as unknown as { alt?: string }).alt, "Clock");
        image.listeners.error();
        assert.equal(node.textContent, "⌛");
        assert.equal(node.children.length, 0);
      }
      assert.equal(createWidgetIcon({ type: "image", src: "javascript:alert(1)" }).textContent, "◷");
      const node = createWidgetIcon({ type: "image", src: "https://example.com/icon.png" }) as unknown as MockNode;
      (node.children[0] as MockNode).listeners.error();
      assert.equal(node.textContent, "◷");
    } finally {
      if (original === undefined) delete (globalThis as { document?: Document }).document;
      else globalThis.document = original;
    }
  });
});
