import { s, text } from "./svg.ts";

export interface GaugeSpec {
  value: number;
  max: number;
  mark?: { at: number; label: string };
}

const SEGMENT = 8;
const GAP = 2;
const HEIGHT = 58;
const BAR_TOP = 6;
const BAR_H = 22;

// Grafana's bar gauge as a row of segments, like the level lights on a mixing desk behind the bar.
export function segmentGauge(spec: GaugeSpec, width: number): SVGSVGElement {
  const count = Math.max(10, Math.floor((width + GAP) / (SEGMENT + GAP)));
  const seg = (width - GAP * (count - 1)) / count;
  const share = spec.max > 0 ? Math.min(1, spec.value / spec.max) : 0;
  const lit = spec.value > 0 ? Math.max(1, Math.round(share * count)) : 0;
  const svg = s("svg", { class: "chart gauge", width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}`, "aria-hidden": "true", focusable: "false" });
  for (let i = 0; i < count; i++) {
    svg.append(s("rect", { class: i < lit ? "segment segment-on" : "segment", x: i * (seg + GAP), y: BAR_TOP, width: seg, height: BAR_H }));
  }
  if (spec.mark && spec.max > 0) {
    const x = Math.round((spec.mark.at / spec.max) * width);
    svg.append(
      s("line", { class: "gauge-mark", x1: x, x2: x, y1: 0, y2: BAR_TOP + BAR_H + 6 }),
      text(Math.min(x, width - 2), HEIGHT - 4, spec.mark.label, { class: "axis-label", "text-anchor": x > width * 0.6 ? "end" : "start" }),
    );
  }
  return svg;
}
