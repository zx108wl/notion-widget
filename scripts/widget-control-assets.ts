import type { RollupOutput } from "rollup";
import path from "node:path";
import { build } from "vite";
import type { FieldWithControl } from "../src/core/schema/widget-config.schema.js";

export async function publishControls(
  config: { id: string; fields: FieldWithControl[] },
  root: string,
  outDir: string,
): Promise<FieldWithControl[]> {
  const fields = config.fields.filter((field) => field.control?.type === "custom");
  if (!fields.length) return config.fields;

  const widgetDir = path.join(root, "widgets", config.id);
  const descriptors = [
    ...new Set(fields.map((field) => JSON.stringify([field.control!.entry, field.control!.export ?? null]))),
  ];
  const styles = [...new Set(fields.flatMap((field) => field.control!.css || []))];

  const source =
    descriptors
      .map((descriptor, index) => {
        const [entry, name] = JSON.parse(descriptor) as [string, string | null];
        return (
          `import * as source${index} from ${JSON.stringify(path.join(widgetDir, entry).replaceAll("\\", "/"))}; ` +
          `export const control${index} = source${index}${name ? `[${JSON.stringify(name)}]` : ""};`
        );
      })
      .join("\n") +
    "\n" +
    styles
      .map((value) => `import ${JSON.stringify(path.join(widgetDir, value).replaceAll("\\", "/"))};`)
      .join("\n");

  const result = await build({
    root,
    configFile: false,
    publicDir: false,
    plugins: [
      {
        name: "widget-custom-controls",
        resolveId(id) {
          if (id === "virtual:widget-controls") return "\0widget-controls";
          return null;
        },
        load(id) {
          if (id === "\0widget-controls") return source;
          return null;
        },
      },
    ],
    build: {
      outDir,
      emptyOutDir: false,
      target: "es2022",
      cssCodeSplit: true,
      rollupOptions: {
        input: "virtual:widget-controls",
        preserveEntrySignatures: "strict",
        output: {
          entryFileNames: `widgets/${config.id}/controls-[hash].js`,
          chunkFileNames: `widgets/${config.id}/controls/chunks/[name]-[hash].js`,
          assetFileNames: (asset) =>
            asset.name?.endsWith(".css")
              ? `widgets/${config.id}/controls-[hash][extname]`
              : `widgets/${config.id}/assets/[name]-[hash][extname]`,
        },
      },
    },
  });

  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => (r as RollupOutput).output);
  const entry = outputs.find((output) => output.type === "chunk" && output.isEntry);
  const prefix = `widgets/${config.id}/`;
  const css = outputs
    .filter((output) => output.type === "asset" && output.fileName.endsWith(".css"))
    .map((output) => "./" + output.fileName.slice(prefix.length));

  if (!entry) throw new Error(`Custom controls did not produce an entry: ${config.id}`);

  return config.fields.map((field) => {
    if (field.control?.type !== "custom") return field;
    const descriptor = JSON.stringify([field.control.entry, field.control.export ?? null]);
    return {
      ...field,
      control: {
        ...field.control,
        entry: "./" + entry.fileName.slice(prefix.length),
        export: "control" + descriptors.indexOf(descriptor),
        css,
      },
    };
  });
}
