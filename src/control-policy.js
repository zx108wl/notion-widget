export const controlTypes = ["input", "slider", "select", "radio", "switch", "custom"];
export function defaultControl(field) { return field.type === "select" ? "select" : field.type === "checkbox" ? "switch" : "input"; }
export function validateControl(field) {
  if (field.control === undefined) return;
  const control = field.control;
  if (!control || typeof control !== "object" || Array.isArray(control) || !controlTypes.includes(control.type)) throw new Error("Invalid control: " + field.key);
  const compatible = { input: ["text", "number", "color", "datetime-local"], slider: ["number"], select: ["select"], radio: ["select"], switch: ["checkbox"] };
  if (control.type !== "custom" && !compatible[control.type].includes(field.type)) throw new Error("Incompatible control: " + field.key);
  if (control.type === "slider" && (!Number.isFinite(field.min) || !Number.isFinite(field.max) || field.min === field.max)) throw new Error("Slider needs a finite range: " + field.key);
  if (control.unit !== undefined && typeof control.unit !== "string") throw new Error("Invalid control unit: " + field.key);
  if (control.showInput !== undefined && typeof control.showInput !== "boolean") throw new Error("Invalid showInput: " + field.key);
  if (control.type === "custom" && (typeof control.entry !== "string" || !/^\.\/[a-zA-Z0-9_./-]+\.js$/.test(control.entry) || control.entry.slice(2).split("/").some(p => !p || p === "." || p === ".."))) throw new Error("Invalid custom control entry: " + field.key);
  if (control.css !== undefined && (!Array.isArray(control.css) || control.css.some(value => typeof value !== "string" || !/^\.\/[a-zA-Z0-9_./-]+\.css$/.test(value) || value.slice(2).split("/").some(part => !part || part === "." || part === "..")))) throw new Error("Invalid control CSS: " + field.key);
  if (control.export !== undefined && !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(control.export)) throw new Error("Invalid control export: " + field.key);
  if (control.props !== undefined && (!control.props || typeof control.props !== "object" || Array.isArray(control.props))) throw new Error("Invalid control props: " + field.key);
  for (const key of ["min", "max", "step", "required", "options", "minLength", "maxLength", "pattern"]) if (key in control) throw new Error("Constraint belongs on field, not control: " + field.key + "/" + key);
}
