import { hatch, s } from "./svg.ts";

export interface SplitSpec {
  solid: number;
  hatched: number;
}

const HEIGHT = 16;
const GAP = 2;

// One bar cut in two: the solid part made fresh, the hatched part reused.
export function splitBar(spec: SplitSpec, width: number): SVGSVGElement {
  const total = spec.solid + spec.hatched;
  const pattern = hatch();
  const svg = s("svg", { class: "chart chart-split", width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}`, "aria-hidden": "true", focusable: "false" }, s("defs", {}, pattern.def));
  if (!total) {
    svg.append(s("rect", { class: "gauge-track", x: 0, y: 0, width, height: HEIGHT, rx: 3 }));
    return svg;
  }
  const both = spec.solid > 0 && spec.hatched > 0;
  const cut = Math.round((spec.solid / total) * width);
  const solidW = both ? Math.min(width - GAP - 3, Math.max(3, cut - GAP / 2)) : width;
  if (spec.solid) svg.append(s("rect", { class: "bar bar-solid", x: 0, y: 0, width: solidW, height: HEIGHT, rx: 3 }));
  if (spec.hatched) {
    const x = spec.solid ? solidW + GAP : 0;
    svg.append(s("rect", { class: "bar bar-hatched", x: x + 0.5, y: 0.5, width: Math.max(2, width - x - 1), height: HEIGHT - 1, rx: 3, fill: `url(#${pattern.id})` }));
  }
  return svg;
}
