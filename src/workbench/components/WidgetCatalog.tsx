import { Menu, Empty } from "antd";
import type { CSSProperties } from "react";
import type { WidgetMeta } from "../../core/loader.js";
import { WidgetIcon } from "./WidgetIcon.js";

interface WidgetCatalogProps {
  /** 已过滤的组件列表 */
  widgets: WidgetMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  collapsed?: boolean;
  /** 折叠态点击菜单中的搜索图标时触发 */
  onSearchClick?: () => void;
}

const SEARCH_KEY = "__search__";

// 折叠态搜索图标：与插件图标同规格的线描 SVG（#8c8c8c / stroke-width 2）
// 不用 antd SearchOutlined —— 其 .anticon 外层会被 antd 按 collapsedIconSize 放大字号，
// 且 currentColor 继承菜单项文字色，渲染出来又大又黑，与插件图标不搭
// 与 WidgetIcon 一致地透传 className，保证 antd 注入的 ant-menu-item-icon 对两类图标同等生效
function SearchLineIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <span className={className ? `widget-icon-bg ${className}` : "widget-icon-bg"} style={style}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#8c8c8c"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.4-3.4" />
      </svg>
    </span>
  );
}

// 左侧导航菜单：标准 Menu 项（图标+名称）；折叠态搜索收敛为菜单首个图标项
export function WidgetCatalog({ widgets, selectedId, onSelect, collapsed, onSearchClick }: WidgetCatalogProps) {
  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === SEARCH_KEY) {
      onSearchClick?.();
      return;
    }
    onSelect(key);
  };

  const items = [
    // 折叠态：搜索收敛为菜单首个图标项，外观与其余组件图标保持一致
    ...(collapsed
      ? [
          {
            key: SEARCH_KEY,
            icon: <SearchLineIcon />,
            label: "",
            title: "搜索组件",
          },
        ]
      : []),
    ...widgets.map((widget) => ({
      key: widget.id,
      icon: <WidgetIcon icon={widget.icon} />,
      label: widget.name,
      title: widget.summary ? `${widget.name} · ${widget.summary}` : widget.name,
    })),
  ];

  if (!collapsed && widgets.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={<span style={{ fontSize: 12 }}>没有匹配的组件</span>}
        style={{ marginTop: 32 }}
      />
    );
  }

  return (
    <Menu
      mode="inline"
      inlineCollapsed={!!collapsed}
      selectedKeys={selectedId ? [selectedId] : []}
      onClick={handleMenuClick}
      style={{ background: "transparent", borderInlineEnd: "none", paddingInline: collapsed ? 4 : 8 }}
      items={items}
    />
  );
}
