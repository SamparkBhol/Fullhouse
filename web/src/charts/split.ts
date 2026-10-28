import { hatch, s } from "./svg.ts";

export interface SplitSpec {
  solid: number;
  hatched: number;
}

const HEIGHT = 22;

// One bar cut in two: the solid part made fresh, the hatched part reused.
export function splitBar(spec: SplitSpec, width: number): SVGSVGElement {
  const total = spec.solid + spec.hatched;
  const pattern = hatch("hatch-haze");
  const svg = s("svg", { class: "chart split", width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}`, "aria-hidden": "true", focusable: "false" }, s("defs", {}, pattern.def));
  if (!total) {
    svg.append(s("rect", { class: "segment", x: 0, y: 0, width, height: HEIGHT }));
    return svg;
  }
  const cut = Math.round((spec.solid / total) * width);
  if (spec.solid) svg.append(s("rect", { class: "bar bar-solid", x: 0, y: 0, width: spec.hatched ? Math.max(2, cut - 1) : width, height: HEIGHT }));
  if (spec.hatched) svg.append(s("rect", { class: "bar bar-hatched", x: spec.solid ? cut + 1 : 0, y: 0, width: spec.solid ? Math.max(2, width - cut - 1) : width, height: HEIGHT, fill: `url(#${pattern.id})` }));
  return svg;
}
