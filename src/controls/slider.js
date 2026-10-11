import { loadBuiltIn } from "./index.js";
export async function mount(root, context) {
  const { field, value, onChange, signal } = context;
  const range = document.createElement("input"); range.type = "range"; range.min = field.min; range.max = field.max; range.step = field.step ?? "any"; range.setAttribute("aria-label", field.label);
  const output = document.createElement("output"); const unit = field.control?.unit || "";
  let editor;
  const setValue = next => { range.value = next === "" ? field.min : next; output.textContent = next + unit; editor?.setValue(next); };
  range.addEventListener("input", () => { setValue(range.value); onChange(range.value); }, { signal });
  root.classList.add("slider-control"); root.append(range, output); setValue(value);
  if (field.control?.showInput) {
    const inputModule = await loadBuiltIn("input");
    if (signal.aborted) return { setValue() {}, destroy() { root.replaceChildren(); } };
    const holder = document.createElement("div"); root.append(holder);
    editor = inputModule.mount(holder, { ...context, onChange(next) { range.value = next; output.textContent = next + unit; onChange(next); } });
  }
  return { setValue, destroy() { editor?.destroy(); root.replaceChildren(); } };
}
