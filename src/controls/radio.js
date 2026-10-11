export function mount(root, { field, value, onChange, signal }) {
  const inputs = [];
  root.setAttribute("role", "radiogroup"); root.setAttribute("aria-label", field.label);
  for (const option of field.options) {
    const label = document.createElement("label"), input = document.createElement("input"), title = document.createElement("span");
    input.type = "radio"; input.name = "radio-" + field.key; input.value = option.value; input.checked = value === option.value; title.textContent = option.label;
    input.addEventListener("change", () => { if (input.checked) onChange(input.value); }, { signal });
    label.append(input, title); root.append(label); inputs.push(input);
  }
  return { setValue(next) { inputs.forEach(input => { input.checked = input.value === next; }); }, destroy() { root.replaceChildren(); } };
}
