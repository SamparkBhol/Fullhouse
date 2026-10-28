import { hoverFrame, type HoverRow, type Mark } from "./hover.ts";
import { s, text } from "./svg.ts";
import { dayMonth } from "./time.ts";

export interface TimelineMark {
  date: string;
  kind: "lit" | "done" | "open" | "withdrawn";
  title: string;
  rows: HoverRow[];
}

const DAY = 86_400_000;
const HEIGHT = 74;
const LANE = 30;
const SIZE = 14;

const dayMs = (date: string) => Date.parse(`${date}T12:00:00Z`);

const KIND_MARK: Record<TimelineMark["kind"], Mark> = { lit: "lit", done: "solid", open: "outline", withdrawn: "outline" };

function ticks(from: number, to: number): number[] {
  const out: number[] = [];
  const weekly = to - from <= 70 * DAY;
  const d = new Date(from);
  if (weekly) {
    d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
    for (let t = d.getTime(); t <= to; t += 7 * DAY) out.push(t);
  } else {
    for (let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12); t <= to; t = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 1, 12)) out.push(t);
  }
  return out;
}

// Nights along the calendar: yellow is out on the street now, filled nights have a turnout,
// hollow ones still wait for it, dashed ones were taken down.
export function nightTimeline(marks: TimelineMark[], today: string, width: number): HTMLElement {
  const dates = [...marks.map((m) => dayMs(m.date)), dayMs(today)];
  const from = Math.min(...dates) - 4 * DAY;
  const to = Math.max(...dates) + 4 * DAY;
  const x = (t: number) => 8 + ((t - from) / (to - from)) * (width - 16);
  const svg = s("svg", { class: "chart timeline", width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}`, "aria-hidden": "true", focusable: "false" });
  svg.append(s("line", { class: "baseline", x1: 0, x2: width, y1: LANE + SIZE / 2 + 10, y2: LANE + SIZE / 2 + 10 }));
  for (const t of ticks(from, to)) {
    svg.append(s("line", { class: "grid", x1: x(t), x2: x(t), y1: LANE + SIZE / 2 + 10, y2: LANE + SIZE / 2 + 16 }), text(x(t), HEIGHT - 4, dayMonth(t), { class: "axis-label", "text-anchor": "middle" }));
  }
  const now = x(dayMs(today));
  svg.append(s("line", { class: "today", x1: now, x2: now, y1: 8, y2: LANE + SIZE + 4 }), text(now + 4, 14, "Today", { class: "axis-label" }));
  const sorted = [...marks].sort((a, b) => a.date.localeCompare(b.date));
  for (const m of sorted) svg.append(s("rect", { class: `night-mark night-${m.kind}`, x: x(dayMs(m.date)) - SIZE / 2, y: LANE, width: SIZE, height: SIZE }));
  const next = sorted.findIndex((m) => m.date >= today);
  return hoverFrame(svg, {
    name: "Your nights by date",
    xs: sorted.map((m) => x(dayMs(m.date))),
    top: LANE - 6,
    bottom: LANE + SIZE + 6,
    start: next >= 0 ? next : sorted.length - 1,
    describe: (i) => {
      const m = sorted[i];
      return m ? { title: m.title, rows: m.rows.map((r) => ({ ...r, mark: r.mark ?? KIND_MARK[m.kind] })) } : { title: "", rows: [] };
    },
  });
}
