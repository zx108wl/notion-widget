import type { CSSProperties } from "react";
import type { WidgetIcon } from "../../core/schema/icon.schema.js";

const FALLBACK = "◷";

interface WidgetIconProps {
  icon: WidgetIcon;
  /** antd Menu 会通过 cloneElement 注入 ant-menu-item-icon 等类名，必须透传到根节点，
      否则折叠态下 antd 的图标对齐规则只对部分图标生效，导致图标间错位 */
  className?: string;
  style?: CSSProperties;
}

// React 版图标渲染：与 core/icon.ts 的 createWidgetIcon（DOM 版，嵌入页用）逻辑对齐
// 图标统一为图片，尺寸/布局由 .widget-icon-bg CSS 类控制（折叠态可被 CSS 覆盖为 antd 默认规格）
export function WidgetIcon({ icon, className, style }: WidgetIconProps) {
  const cls = className ? `widget-icon-bg ${className}` : "widget-icon-bg";
  return (
    <span className={cls} style={style}>
      <img
        src={icon.src}
        alt={icon.alt ?? ""}
        loading="lazy"
        decoding="async"
        onError={(e) => {
          const target = e.currentTarget;
          target.style.display = "none";
          const parent = target.parentElement;
          if (parent) parent.textContent = icon.fallback ?? FALLBACK;
        }}
      />
    </span>
  );
}
