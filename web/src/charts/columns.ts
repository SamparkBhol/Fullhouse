import { hoverFrame, type HoverRow } from "./hover.ts";
import { niceMax } from "./scale.ts";
import { hatch, s, text } from "./svg.ts";

export interface ColumnSeries {
  name: string;
  values: number[];
  mark: "solid" | "hatched";
}

export interface ColumnsSpec {
  name: string;
  series: ColumnSeries[];
  tick(i: number): string;
  span(i: number): string;
  extra?(i: number): HoverRow[];
  crosses?: number[];
  // Buckets before this index were never counted: they are dimmed, and the label marks where counting began.
  countedFrom?: { index: number; label: string };
  maxBar?: number;
  height?: number;
}

const TOP = 14;
const BOTTOM = 26;
const AXIS = 36;
const MIN_BAR = 2;
const LABEL_ROOM = 46;
const CROSS = 4;
const MARKER_ROOM = 150;

// Stacked columns, one per bucket, the first series at the bottom. Values are counts, so the axis starts at zero.
// A cross above a column marks a bucket with failures, so errors never depend on color alone.
export function columns(spec: ColumnsSpec, width: number): HTMLElement {
  const height = spec.height ?? 200;
  const n = spec.series[0]?.values.length ?? 0;
  const totals = Array.from({ length: n }, (_, i) => spec.series.reduce((sum, ser) => sum + (ser.values[i] ?? 0), 0));
  const max = niceMax(Math.max(0, ...totals));
  const plot = height - TOP - BOTTOM;
  const bw = n ? Math.min((width - AXIS) / n, spec.maxBar ?? Infinity) : width - AXIS;
  const left = (i: number) => AXIS + i * bw;
  const mid = (i: number) => left(i) + bw / 2;
  const y = (v: number) => TOP + plot - (v / max) * plot;
  const pattern = hatch("hatch-haze");
  const svg = s("svg", { class: "chart columns", width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true", focusable: "false" }, s("defs", {}, pattern.def));

  for (const v of [max, max / 2]) {
    svg.append(s("line", { class: "grid", x1: AXIS, x2: width, y1: y(v), y2: y(v) }), text(AXIS - 8, y(v) + 5, String(v), { class: "axis-label", "text-anchor": "end" }));
  }
  svg.append(text(AXIS - 8, TOP + plot + 5, "0", { class: "axis-label", "text-anchor": "end" }));
  const counted = Math.min(n, Math.max(0, spec.countedFrom?.index ?? 0));
  if (counted > 0 && spec.countedFrom) {
    const edge = left(counted);
    svg.append(
      s("rect", { class: "uncounted", x: AXIS, y: TOP, width: edge - AXIS, height: plot }),
      s("line", { class: "counted-edge", x1: edge, x2: edge, y1: TOP, y2: TOP + plot }),
      // Above the plot, where no column reaches: left of the edge when it fits there, right of it when not.
      edge - AXIS >= MARKER_ROOM
        ? text(edge - 4, TOP - 3, spec.countedFrom.label, { class: "axis-label", "text-anchor": "end" })
        : text(edge + 4, TOP - 3, spec.countedFrom.label, { class: "axis-label", "text-anchor": "start" }),
    );
  }
  for (let i = 0; i < n; i++) {
    let base = 0;
    spec.series.forEach((ser, k) => {
      const v = ser.values[i] ?? 0;
      if (v <= 0) return;
      const bottom = y(base) - (k > 0 && base > 0 ? 2 : 0);
      const top = Math.min(bottom - MIN_BAR, y(base + v));
      svg.append(
        s("rect", {
          class: ser.mark === "hatched" ? "bar bar-hatched" : "bar bar-solid",
          x: left(i) + 1,
          y: top,
          width: Math.max(1, bw - 2),
          height: Math.max(MIN_BAR, bottom - top),
          fill: ser.mark === "hatched" ? `url(#${pattern.id})` : null,
        }),
      );
      base += v;
    });
  }
  svg.append(s("line", { class: "baseline", x1: AXIS, x2: width, y1: TOP + plot, y2: TOP + plot }));
  spec.crosses?.forEach((count, i) => {
    if (!(count > 0)) return;
    const cx = mid(i);
    const cy = Math.max(CROSS + 2, y(totals[i] ?? 0) - CROSS - 4);
    svg.append(s("path", { class: "cross", d: `M${cx - CROSS} ${cy - CROSS}L${cx + CROSS} ${cy + CROSS}M${cx + CROSS} ${cy - CROSS}L${cx - CROSS} ${cy + CROSS}` }));
  });
  // Labels are placed from the newest bucket back; an empty tick is skipped, and none sits closer than LABEL_ROOM to the last.
  let placed = Infinity;
  for (let i = n - 1; i >= 0; i--) {
    const label = spec.tick(i);
    if (!label || placed - mid(i) < LABEL_ROOM) continue;
    const atEdge = mid(i) + LABEL_ROOM / 2 > width;
    svg.append(text(atEdge ? width - 2 : mid(i), height - 6, label, { class: "axis-label", "text-anchor": atEdge ? "end" : "middle" }));
    placed = mid(i);
  }

  return hoverFrame(svg, {
    name: spec.name,
    xs: Array.from({ length: n }, (_, i) => mid(i)),
    top: TOP,
    bottom: TOP + plot,
    describe: (i) => ({
      title: spec.span(i),
      rows:
        i < counted
          ? [{ label: "Not counted", value: "before counting began" }]
          : [...spec.series.map((ser) => ({ label: ser.name, value: String(ser.values[i] ?? 0), mark: ser.mark })), ...(spec.extra?.(i) ?? [])],
    }),
  });
}
