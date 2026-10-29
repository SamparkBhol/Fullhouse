import { s, text } from "./svg.ts";

export interface GaugeSpec {
  value: number;
  max: number;
  mark?: { at: number; label: string };
}

const HEIGHT = 50;
const BAR_TOP = 6;
const BAR_H = 14;
const LABEL_ROOM = 150;

export function barGauge(spec: GaugeSpec, width: number): SVGSVGElement {
  const share = spec.max > 0 ? Math.min(1, Math.max(0, spec.value / spec.max)) : 0;
  // Any use at all shows, even one call of thousands.
  const used = spec.value > 0 ? Math.max(3, Math.round(share * width)) : 0;
  const svg = s(
    "svg",
    { class: "chart gauge", width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}`, "aria-hidden": "true", focusable: "false" },
    s("rect", { class: "gauge-track", x: 0, y: BAR_TOP, width, height: BAR_H, rx: 3 }),
    used ? s("rect", { class: "gauge-used", x: 0, y: BAR_TOP, width: used, height: BAR_H, rx: 3 }) : null,
  );
  if (spec.mark && spec.max > 0) {
    const x = Math.max(1, Math.min(width - 1, Math.round((spec.mark.at / spec.max) * width)));
    const label =
      width - x >= LABEL_ROOM
        ? text(x + 2, HEIGHT - 4, spec.mark.label, { class: "axis-label", "text-anchor": "start" })
        : text(x >= LABEL_ROOM ? x - 2 : width, HEIGHT - 4, spec.mark.label, { class: "axis-label", "text-anchor": "end" });
    svg.append(s("line", { class: "gauge-mark", x1: x, x2: x, y1: 0, y2: BAR_TOP + BAR_H + 6 }), label);
  }
  return svg;
}
