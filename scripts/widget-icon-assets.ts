import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { iconSchema } from "../src/core/schema/icon.schema.js";
import type { WidgetIcon } from "../src/core/schema/icon.schema.js";

export async function publishIcon(
  icon: WidgetIcon,
  widgetDir: string,
  outputDir: string,
): Promise<WidgetIcon> {
  iconSchema.parse(icon);
  if (typeof icon !== "object" || icon.type !== "image" || !icon.src.startsWith("./")) return icon;
  const source = await readFile(path.join(widgetDir, icon.src));
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 12);
  const filename = `icon-${hash}${path.extname(icon.src).toLowerCase()}`;
  const assetsDir = path.join(outputDir, "assets");
  await mkdir(assetsDir, { recursive: true });
  await writeFile(path.join(assetsDir, filename), source);
  return { ...icon, src: `./assets/${filename}` };
}
