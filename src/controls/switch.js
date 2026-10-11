import { bind } from "./common.js";
export function mount(root, context) {
  const wrapper = document.createElement("label"); wrapper.className = "switch";
  const input = document.createElement("input"); input.type = "checkbox"; input.setAttribute("aria-label", context.field.label);
  const instance = bind(wrapper, input, context, "change"); wrapper.append(document.createElement("span")); root.append(wrapper);
  return { setValue: instance.setValue, destroy() { instance.destroy(); root.replaceChildren(); } };
}
