export type PanelLayout = { id: string; span: number; height: number };
export function normalizeLayout(raw: string, defaults: PanelLayout[]): PanelLayout[] {
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return defaults;
  }
  if (
    !saved ||
    typeof saved !== "object" ||
    !("version" in saved) ||
    saved.version !== 1 ||
    !("panels" in saved) ||
    !Array.isArray(saved.panels)
  )
    return defaults;
  const result: PanelLayout[] = [];
  for (const panel of saved.panels) {
    if (!panel || typeof panel !== "object") continue;
    const original = defaults.find((d) => d.id === panel.id);
    if (!original || result.some((d) => d.id === panel.id)) continue;
    result.push({
      id: original.id,
      span: Number.isInteger(panel.span) ? Math.max(4, Math.min(12, panel.span)) : original.span,
      height:
        panel.height === 0
          ? 0
          : Number.isInteger(panel.height)
            ? Math.max(240, Math.min(1000, panel.height))
            : original.height,
    });
  }
  return [...result, ...defaults.filter((d) => !result.some((p) => p.id === d.id))];
}
export function movePanel(layout: PanelLayout[], from: string, target: string) {
  const index = layout.findIndex((p) => p.id === from),
    destination = layout.findIndex((p) => p.id === target);
  if (index < 0 || destination < 0 || index === destination) return layout;
  const result = [...layout],
    [panel] = result.splice(index, 1);
  result.splice(destination, 0, panel);
  return result;
}
