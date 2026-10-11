import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateIcon } from "../src/widget-config.js";

export async function publishIcon(icon, widgetDir, outputDir) {
  validateIcon(icon);
  if (icon?.type !== "image" || !icon.src.startsWith("./")) return icon;
  const source = await readFile(path.join(widgetDir, icon.src));
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 12);
  const filename = `icon-${hash}${path.extname(icon.src).toLowerCase()}`;
  const assetsDir = path.join(outputDir, "assets");
  await mkdir(assetsDir, { recursive: true });
  await writeFile(path.join(assetsDir, filename), source);
  return { ...icon, src: `./assets/${filename}` };
}
