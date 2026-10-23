import { z } from "zod";

const localAssetPath = /^\.\/[a-zA-Z0-9_./-]+$/;
const imageExt = /\.(png|jpe?g|gif|webp|avif|svg|ico)$/i;

function isValidLocalPath(value: string): boolean {
  const parts = value.slice(2).split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..");
}

// 插件图标统一为图片：工作台与嵌入页共用同一渲染路径（<img>），保证视觉一致
// 本地路径相对 widget 目录（构建时由 publishIcon 发布并加内容哈希），远程仅允许 http(s)
const imageIconSchema = z
  .object({
    type: z.literal("image"),
    src: z.string(),
    alt: z.string().optional(),
    fallback: z.string().optional(),
  })
  .superRefine((icon, ctx) => {
    if (localAssetPath.test(icon.src) && isValidLocalPath(icon.src)) {
      if (!imageExt.test(icon.src)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "本地图标必须是图片格式",
          path: ["src"],
        });
      }
      return;
    }
    try {
      const url = new URL(icon.src);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "远程图标必须使用 http(s) 协议",
          path: ["src"],
        });
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "图标必须使用本地图片路径或 HTTP(S) URL",
        path: ["src"],
      });
    }
  });

export const iconSchema = imageIconSchema;
export type WidgetIcon = z.infer<typeof iconSchema>;

export const iconObjectSchema = imageIconSchema;
