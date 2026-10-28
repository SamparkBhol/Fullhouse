import { hoverFrame } from "./hover.ts";
import { s } from "./svg.ts";

const HEIGHT = 40;
const PAD = 4;

export interface SparkSpec {
  name: string;
  values: number[];
  tone: "chalk" | "lit";
  describe(i: number): { title: string; value: string };
}

// One line per bucket. A flat line on the floor means nothing happened, which is drawn, not hidden.
export function sparkline(spec: SparkSpec, width: number): HTMLElement {
  const n = spec.values.length;
  const max = Math.max(1, ...spec.values);
  // A corrected turnout can take people off a bucket; the line stays on the floor rather than under it.
  const step = n > 1 ? (width - PAD * 2) / (n - 1) : 0;
  const xs = spec.values.map((_, i) => PAD + i * step);
  const ys = spec.values.map((v) => HEIGHT - PAD - (Math.max(0, v) / max) * (HEIGHT - PAD * 2));
  const points = xs.map((x, i) => `${x.toFixed(1)},${(ys[i] ?? 0).toFixed(1)}`).join(" ");
  const last = n - 1;
  const svg = s(
    "svg",
    { class: `spark spark-${spec.tone}`, width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}`, "aria-hidden": "true", focusable: "false" },
    s("line", { class: "spark-floor", x1: PAD, x2: width - PAD, y1: HEIGHT - PAD, y2: HEIGHT - PAD }),
    s("polyline", { class: "spark-line", points }),
    last >= 0 ? s("rect", { class: "spark-end", x: (xs[last] ?? 0) - 3, y: (ys[last] ?? 0) - 3, width: 6, height: 6 }) : null,
  );
  return hoverFrame(svg, {
    name: spec.name,
    xs,
    top: PAD,
    bottom: HEIGHT - PAD,
    describe: (i) => {
      const d = spec.describe(i);
      return { title: d.title, rows: [{ label: spec.name, value: d.value }] };
    },
  });
}
