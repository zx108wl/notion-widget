export function bind(root, input, { field, value, onChange, signal }, event = "input") {
  input.id = "field-" + field.key;
  input.name = field.key;
  input.setAttribute("aria-describedby", "error-" + field.key);
  input.setAttribute("aria-label", field.label);
  if (field.type === "number" && field.step === undefined) input.step = "any";
  input.required = field.required || false;
  if (field.placeholder) input.placeholder = field.placeholder;
  for (const key of ["min", "max", "step", "minLength", "maxLength", "pattern"]) if (field[key] !== undefined) input[key] = field[key];
  const setValue = next => { if (input.type === "checkbox") input.checked = next === "1"; else input.value = next; };
  setValue(value);
  const listener = () => onChange(input.type === "checkbox" ? (input.checked ? "1" : "0") : input.value);
  input.addEventListener(event, listener, { signal });
  root.append(input);
  return { setValue, destroy() { input.removeEventListener(event, listener); root.replaceChildren(); } };
}
