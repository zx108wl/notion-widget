import { List, Tooltip } from "antd";
import type { WidgetMeta } from "../../core/loader.js";
import { createWidgetIcon } from "../../core/icon.js";
import { useEffect, useRef } from "react";

interface WidgetCatalogProps {
  widgets: WidgetMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  collapsed?: boolean;
}

export function WidgetCatalog({ widgets, selectedId, onSelect, collapsed }: WidgetCatalogProps) {
  if (collapsed) {
    return <CollapsedCatalog widgets={widgets} selectedId={selectedId} onSelect={onSelect} />;
  }
  return (
    <List
      dataSource={widgets}
      renderItem={(widget) => {
        const active = widget.id === selectedId;
        return (
          <List.Item
            onClick={() => onSelect(widget.id)}
            style={{
              cursor: "pointer",
              padding: "10px",
              borderRadius: 12,
              border: active ? "1px solid var(--border-strong)" : "1px solid transparent",
              background: active ? "var(--bg-item)" : "transparent",
            }}
          >
            <WidgetIcon icon={widget.icon} active={active} />
            <div style={{ marginLeft: 10, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{widget.name}</div>
              <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>{widget.summary}</div>
            </div>
          </List.Item>
        );
      }}
    />
  );
}

/* 折叠态：独立组件，图标 + 右侧浮层名称，选中态用左缘强调条（与右栏选项卡语言一致） */
function CollapsedCatalog({
  widgets,
  selectedId,
  onSelect,
}: {
  widgets: WidgetMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "8px 0 12px" }}>
      {widgets.map((widget) => {
        const active = widget.id === selectedId;
        return (
          <Tooltip key={widget.id} title={widget.name} placement="right" mouseEnterDelay={0.2}>
            <div
              onClick={() => onSelect(widget.id)}
              role="button"
              aria-label={widget.name}
              aria-pressed={active}
              style={{
                position: "relative",
                cursor: "pointer",
                width: 40,
                height: 40,
                display: "grid",
                placeItems: "center",
                borderRadius: 10,
                background: active ? "var(--bg-item)" : "transparent",
                boxShadow: active ? "inset 0 0 0 1px var(--border-strong)" : "none",
              }}
            >
              {active && (
                <span
                  style={{
                    position: "absolute",
                    left: -6,
                    top: 8,
                    bottom: 8,
                    width: 3,
                    borderRadius: 2,
                    background: "var(--accent)",
                  }}
                />
              )}
              <WidgetIcon icon={widget.icon} active={active} />
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}

function WidgetIcon({ icon, active }: { icon: WidgetMeta["icon"]; active?: boolean }) {
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
        background: "var(--bg-icon)",
        fontSize: 18,
        flexShrink: 0,
        opacity: active ? 1 : 0.75,
      }}
    />
  );
}
