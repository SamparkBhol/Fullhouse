import { hoverFrame, type HoverRow } from "./hover.ts";
import { niceMax } from "./scale.ts";
import { s, text } from "./svg.ts";

export interface TallyNight {
  weekday: string;
  day: string;
  kind: "lit" | "done" | "open" | "withdrawn";
  title: string;
  rsvps: number;
  came?: number;
  room?: number;
  rows: HoverRow[];
}

const TOP = 40;
const AREA = 150;
const FOOT = 44;
const SLOT_MIN = 58;
const COL_MAX = 46;
const SLOT_MAX = 112;

let hatches = 0;

// Chalk shading: diagonal strokes, the way a count is filled in on a board.
function chalkHatch(): { id: string; def: SVGPatternElement } {
  hatches += 1;
  const id = `chalk${hatches}`;
  return { id, def: s("pattern", { id, width: 7, height: 7, patternUnits: "userSpaceOnUse", patternTransform: "rotate(-35)" }, s("line", { x1: 1, y1: 0, x2: 1, y2: 7, class: "tally-hatch" })) };
}

function figures(n: TallyNight): [string, string] {
  if (n.kind === "lit") return [String(n.rsvps), "said yes"];
  if (n.came !== undefined) return [String(n.came), n.room === undefined ? "came" : `of ${n.room}`];
  return ["", n.kind === "withdrawn" ? "taken down" : "not logged"];
}

// The nights as columns written up in chalk: the dashed box is the room, the shading is who came,
// the yellow stroke is how many said yes. The numbers are written over each column, so none hides behind a hover.
export function tallyColumns(nights: TallyNight[], width: number): HTMLElement {
  const fit = Math.max(3, Math.floor(width / SLOT_MIN));
  const shown = nights.slice(-fit);
  const slot = Math.min(SLOT_MAX, width / Math.max(1, shown.length));
  const col = Math.min(COL_MAX, slot * 0.56);
  const max = niceMax(Math.max(1, ...shown.flatMap((n) => [n.room ?? 0, n.came ?? 0, n.rsvps])));
  const base = TOP + AREA;
  const y = (v: number) => base - (v / max) * AREA;
  const height = base + FOOT;
  const hatch = chalkHatch();
  const svg = s("svg", { class: "chart tally-chart", width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true", focusable: "false" }, s("defs", {}, hatch.def));
  svg.append(s("line", { class: "tally-floor", x1: 0, x2: width, y1: base + 1, y2: base + 1 }));
  const centers = shown.map((n, i) => {
    const x = i * slot + (slot - col) / 2;
    const mid = x + col / 2;
    const g = s("g", { class: `tally-col night-${n.kind}` });
    if (n.room) g.append(s("rect", { class: "tally-room", x, y: y(n.room), width: col, height: base - y(n.room) }));
    if (n.came) {
      g.append(
        s("rect", { class: "tally-came", x: x + 3, y: y(n.came), width: col - 6, height: base - y(n.came), fill: `url(#${hatch.id})` }),
        s("line", { class: "tally-top", x1: x + 3, x2: x + col - 3, y1: y(n.came), y2: y(n.came) }),
      );
    }
    if (n.rsvps) g.append(s("line", { class: "tally-yes", x1: x - 5, x2: x + col + 5, y1: y(n.rsvps), y2: y(n.rsvps) }));
    const top = Math.min(y(n.room ?? 0), y(n.came ?? 0), y(n.rsvps));
    const [big, small] = figures(n);
    if (big) g.append(text(mid, top - 22, big, { class: n.kind === "lit" ? "tally-big tally-big-lit" : "tally-big", "text-anchor": "middle" }));
    g.append(
      text(mid, top - 7, small, { class: "tally-small", "text-anchor": "middle" }),
      text(mid, base + 20, n.weekday, { class: "tally-day", "text-anchor": "middle" }),
      text(mid, base + 38, n.day, { class: "tally-date", "text-anchor": "middle" }),
    );
    svg.append(g);
    return mid;
  });
  const free = width - shown.length * slot;
  if (free > 240) svg.append(text(shown.length * slot + 24, base - AREA / 2, "Each night you publish adds a column here.", { class: "tally-hint" }));
  const next = shown.findIndex((n) => n.kind === "lit");
  return hoverFrame(svg, {
    name: "Your nights",
    xs: centers,
    top: TOP - 10,
    bottom: base,
    start: next >= 0 ? next : shown.length - 1,
    describe: (i) => {
      const n = shown[i];
      return n ? { title: n.title, rows: n.rows } : { title: "", rows: [] };
    },
  });
}
