import { Menu } from "antd";
import type { WidgetMeta } from "../../core/loader.js";
import { createWidgetIcon } from "../../core/icon.js";
import { useEffect, useRef } from "react";

interface WidgetCatalogProps {
  widgets: WidgetMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  collapsed?: boolean;
}

/* 左侧导航菜单：展开显示图标+名称+摘要，折叠由 Menu inlineCollapsed 处理（图标+Tooltip） */
export function WidgetCatalog({ widgets, selectedId, onSelect, collapsed }: WidgetCatalogProps) {
  return (
    <Menu
      mode="inline"
      inlineCollapsed={!!collapsed}
      selectedKeys={selectedId ? [selectedId] : []}
      onClick={({ key }) => onSelect(key)}
      style={{ background: "transparent", borderInlineEnd: "none", paddingInline: collapsed ? 0 : 8 }}
      items={widgets.map((widget) => ({
        key: widget.id,
        icon: <WidgetIcon icon={widget.icon} />,
        label: collapsed ? widget.name : (
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0, lineHeight: 1.35 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{widget.name}</span>
            <span style={{ color: "var(--text-secondary)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {widget.summary}
            </span>
          </div>
        ),
        title: widget.name,
      }))}
    />
  );
}

function WidgetIcon({ icon }: { icon: WidgetMeta["icon"] }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = "";
      ref.current.appendChild(createWidgetIcon(icon));
    }
  }, [icon]);
  return (
    <span
      ref={ref}
      style={{
        width: 26,
        height: 26,
        display: "grid",
        placeItems: "center",
        borderRadius: 7,
        background: "var(--bg-icon)",
        fontSize: 15,
        flexShrink: 0,
      }}
    />
  );
}
