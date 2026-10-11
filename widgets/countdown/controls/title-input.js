export function mount(root, { field, value, onChange, signal }) {
  const input = document.createElement("input"); input.type = "text"; input.value = value; input.id = "field-" + field.key;
  input.maxLength = field.maxLength ?? 120; input.placeholder = field.placeholder || "填写事件名称";
  const count = document.createElement("small"); count.className = "muted";
  const setValue = next => { input.value = next; count.textContent = next.length + " / " + input.maxLength; };
  setValue(value);
  input.addEventListener("input", () => { count.textContent = input.value.length + " / " + input.maxLength; onChange(input.value); }, { signal });
  root.append(input, count);
  return { setValue, destroy() { root.replaceChildren(); } };
}
