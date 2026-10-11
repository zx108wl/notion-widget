import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateIcon, validateConfig, widgetMetadata } from "../src/widget-config.js";
import { publishIcon } from "../scripts/widget-icon-assets.js";
import { createWidgetIcon } from "../src/widget-icon.js";

test("icon types, config validation and metadata URL resolution", async () => {
  const config = JSON.parse(await readFile(new URL("../widgets/clock/config.json", import.meta.url), "utf8"));
  for (const icon of ["👋", { type: "text", value: "◷" }, { type: "image", src: "./assets/icon.svg" }, { type: "image", src: "https://example.com/icon" }, { type: "image", src: "http://example.com/icon.png" }]) {
    validateConfig({ ...config, icon }, "clock");
  }
  for (const icon of ["", null, [], { type: "text", value: "" }, { type: "lucide", name: "clock" }, { type: "image", src: "./../icon.svg" }, { type: "image", src: "./assets/icon.exe" }, { type: "image", src: "javascript:alert(1)" }, { type: "image", src: "data:image/svg+xml,x" }, { type: "image", src: "//example.com/icon.png" }, { type: "image", src: "https://example.com/icon.png", fallback: 1 }]) {
    assert.throws(() => validateIcon(icon));
  }
  assert.equal(widgetMetadata(config, "/widgets/clock/config.json").icon.src, "/widgets/clock/assets/icon.svg");
  assert.equal(config.icon.src, "./assets/icon.svg");
  const remote = { type: "image", src: "https://example.com/icon.png" };
  assert.deepEqual(widgetMetadata({ ...config, icon: remote }, "/widgets/clock/config.json").icon, remote);
});

test("local icons publish bytes with stable content hashes and preserve fallback", async () => {
  const tempBase = path.resolve(os.tmpdir());
  const temp = await mkdtemp(path.join(tempBase, "widget-icon-test-"));
  assert.equal(path.dirname(path.resolve(temp)), tempBase);
  try {
    await writeFile(path.join(temp, "icon.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const icon = { type: "image", src: "./icon.svg", alt: "Clock", fallback: "◷" };
    const outputDir = path.join(temp, "output");
    const first = await publishIcon(icon, temp, outputDir);
    assert.match(first.src, /^\.\/assets\/icon-[0-9a-f]{12}\.svg$/);
    assert.equal(first.fallback, "◷");
    assert.equal(await readFile(path.join(outputDir, first.src), "utf8"), await readFile(path.join(temp, "icon.svg"), "utf8"));
    assert.deepEqual(await publishIcon(icon, temp, outputDir), first);
    await writeFile(path.join(temp, "icon.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><circle/></svg>');
    assert.notEqual((await publishIcon(icon, temp, outputDir)).src, first.src);
    await assert.rejects(publishIcon({ type: "image", src: "./missing.png" }, temp, outputDir));
    for (const value of ["◷", { type: "text", value: "👋" }, { type: "image", src: "https://example.com/icon.png" }]) assert.deepEqual(await publishIcon(value, temp, outputDir), value);
  } finally {
    // Only remove the unique temporary directory verified to be inside the OS temp directory.
    assert.equal(path.dirname(path.resolve(temp)), tempBase);
    await rm(temp, { recursive: true, force: true });
  }
});

test("renderer uses text, image and fallback without interpreting HTML", () => {
  const original = globalThis.document;
  globalThis.document = { createElement(tag) { return { tag, children: [], listeners: {}, append(child) { this.children.push(child); }, addEventListener(name, fn) { this.listeners[name] = fn; }, set textContent(value) { this.text = value; this.children = []; }, get textContent() { return this.text; } }; } };
  try {
    assert.equal(createWidgetIcon("<b>◷</b>").textContent, "<b>◷</b>");
    assert.equal(createWidgetIcon({ type: "text", value: "👋" }).textContent, "👋");
    for (const src of ["/widgets/clock/assets/icon-a.svg", "https://example.com/icon.png"]) {
      const node = createWidgetIcon({ type: "image", src, alt: "Clock", fallback: "⌛" });
      const image = node.children[0];
      assert.equal(image.tag, "img");
      assert.equal(image.src, src);
      assert.equal(image.alt, "Clock");
      image.listeners.error();
      assert.equal(node.textContent, "⌛");
      assert.equal(node.children.length, 0);
    }
    assert.equal(createWidgetIcon({ type: "image", src: "javascript:alert(1)" }).textContent, "◷");
    const node = createWidgetIcon({ type: "image", src: "https://example.com/icon.png" });
    node.children[0].listeners.error();
    assert.equal(node.textContent, "◷");
  } finally { if (original === undefined) delete globalThis.document; else globalThis.document = original; }
});
