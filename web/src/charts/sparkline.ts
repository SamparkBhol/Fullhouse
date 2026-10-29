import { hoverFrame } from "./hover.ts";
import { s } from "./svg.ts";

const HEIGHT = 44;
const PAD = 5;

export interface SparkSpec {
  name: string;
  values: number[];
  describe(i: number): { title: string; value: string };
}

// One line per bucket. A flat line on the floor means nothing happened, which is drawn, not hidden.
export function sparkline(spec: SparkSpec, width: number): HTMLElement {
  const n = spec.values.length;
  const max = Math.max(1, ...spec.values);
  const step = n > 1 ? (width - PAD * 2) / (n - 1) : 0;
  const xs = spec.values.map((_, i) => PAD + i * step);
  // A corrected turnout can take people off a bucket; the line stays on the floor rather than under it.
  const ys = spec.values.map((v) => HEIGHT - PAD - (Math.max(0, v) / max) * (HEIGHT - PAD * 2));
  const points = xs.map((x, i) => `${x.toFixed(1)},${(ys[i] ?? 0).toFixed(1)}`).join(" ");
  const last = n - 1;
  const svg = s(
    "svg",
    { class: "chart spark", width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}`, "aria-hidden": "true", focusable: "false" },
    s("line", { class: "spark-floor", x1: PAD, x2: width - PAD, y1: HEIGHT - PAD, y2: HEIGHT - PAD }),
    s("polyline", { class: "spark-line", points }),
    last >= 0 ? s("circle", { class: "spark-end", cx: xs[last] ?? 0, cy: ys[last] ?? 0, r: 3.5 }) : null,
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
