export const sharedFields = [
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
