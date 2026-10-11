import { bind } from "./common.js";
export function mount(root, context) {
  const input = document.createElement("select");
  for (const { value, label } of context.field.options) { const option = document.createElement("option"); option.value = value; option.textContent = label; input.append(option); }
  return bind(root, input, context, "change");
}
