import { bind } from "./common.js";
export function mount(root, context) {
  const input = document.createElement("input");
  input.type = context.field.type;
  return bind(root, input, context);
}
