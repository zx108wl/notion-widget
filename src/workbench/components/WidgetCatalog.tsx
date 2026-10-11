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

/* 左侧导航菜单：标准 Menu 项（图标+名称），折叠与 Tooltip 由 Menu 内建处理 */
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
        label: widget.name,
        title: widget.summary ? `${widget.name} · ${widget.summary}` : widget.name,
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
        width: 18,
        height: 18,
        display: "grid",
        placeItems: "center",
        fontSize: 14,
        flexShrink: 0,
      }}
    />
  );
}
