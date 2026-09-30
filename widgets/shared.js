export const sharedFields = [
  { key: "width", label: "组件宽度（px，留空自适应）", type: "number", default: "", min: 280, max: 1200, step: 1 },
  { key: "height", label: "组件高度（px，留空自适应）", type: "number", default: "", min: 160, max: 1000, step: 1 },
  {
    key: "theme", label: "显示主题", type: "select", default: "auto",
    options: [
      { value: "auto", label: "跟随系统" },
      { value: "light", label: "浅色" },
      { value: "dark", label: "深色" },
    ],
  },
  { key: "accent", label: "强调色", type: "color", default: "#6c5ce7" },
];

export function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}
