import { List } from "antd";
import type { WidgetMeta } from "../../core/loader.js";
import { createWidgetIcon } from "../../core/icon.js";
import { useEffect, useRef } from "react";

interface WidgetCatalogProps {
  widgets: WidgetMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function WidgetCatalog({ widgets, selectedId, onSelect }: WidgetCatalogProps) {
  return (
    <List
      dataSource={widgets}
      renderItem={(widget) => (
        <List.Item
          onClick={() => onSelect(widget.id)}
          style={{
            cursor: "pointer",
            padding: "10px",
            borderRadius: 12,
            border: selectedId === widget.id ? "1px solid #d9d9d9" : "1px solid transparent",
            background: selectedId === widget.id ? "#fff" : "transparent",
          }}
        >
          <WidgetIcon icon={widget.icon} />
          <div style={{ marginLeft: 10, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{widget.name}</div>
            <div style={{ color: "#8c8c8c", fontSize: 12 }}>{widget.summary}</div>
          </div>
        </List.Item>
      )}
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
        width: 38,
        height: 38,
        display: "grid",
        placeItems: "center",
        borderRadius: 10,
        background: "#f0f0f0",
        fontSize: 18,
        flexShrink: 0,
      }}
    />
  );
}
