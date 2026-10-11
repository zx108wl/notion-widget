export const widgets: Record<string, { id: string }> = Object.fromEntries(
  ["clock", "countdown", "status"].map((id) => [id, { id }]),
);

export type WidgetRegistry = typeof widgets;
