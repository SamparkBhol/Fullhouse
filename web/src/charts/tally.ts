import { hoverFrame, type HoverRow } from "./hover.ts";
import { niceMax } from "./scale.ts";
import { s, text } from "./svg.ts";

export interface TallyNight {
  weekday: string;
  day: string;
  kind: "upcoming" | "done" | "open" | "withdrawn";
  title: string;
  rsvps: number;
  came?: number;
  room?: number;
  rows: HoverRow[];
}

const TOP = 44;
const AREA = 150;
const FOOT = 46;
const SLOT_MIN = 58;
const COL_MAX = 46;
const SLOT_MAX = 112;
const HINT_ROOM = 340;

function figures(n: TallyNight): [string, string] {
  if (n.kind === "upcoming") return [String(n.rsvps), "said yes"];
  if (n.came !== undefined) return [String(n.came), n.room === undefined ? "came" : `of ${n.room}`];
  return ["", n.kind === "withdrawn" ? "taken down" : "not logged"];
}

// The nights as columns: the outline is the room, the shaded part is who came, the green line is how many said yes.
// The numbers are written over each column, so none hides behind a hover.
export function tallyColumns(nights: TallyNight[], width: number): HTMLElement {
  const fit = Math.max(3, Math.floor(width / SLOT_MIN));
  const shown = nights.slice(-fit);
  const slot = Math.min(SLOT_MAX, width / Math.max(1, shown.length));
  const col = Math.min(COL_MAX, slot * 0.56);
  const max = niceMax(Math.max(1, ...shown.flatMap((n) => [n.room ?? 0, n.came ?? 0, n.rsvps])));
  const base = TOP + AREA;
  const y = (v: number) => base - (v / max) * AREA;
  const height = base + FOOT;
  const svg = s("svg", { class: "chart nights-chart", width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true", focusable: "false" });
  svg.append(s("line", { class: "nights-floor", x1: 0, x2: width, y1: base + 0.5, y2: base + 0.5 }));
  const centers = shown.map((n, i) => {
    const x = i * slot + (slot - col) / 2;
    const mid = x + col / 2;
    const g = s("g", { class: `nights-col night-${n.kind}` });
    if (n.room) g.append(s("rect", { class: "nights-room", x: x + 0.5, y: y(n.room) + 0.5, width: col - 1, height: base - y(n.room) - 0.5 }));
    if (n.came) {
      g.append(
        s("rect", { class: "nights-came", x: x + 4, y: y(n.came), width: col - 8, height: base - y(n.came) }),
        s("line", { class: "nights-top", x1: x + 4, x2: x + col - 4, y1: y(n.came), y2: y(n.came) }),
      );
    }
    if (n.rsvps) {
      const at = y(n.rsvps);
      g.append(s("line", { class: "nights-yes-ring", x1: x - 5, x2: x + col + 5, y1: at, y2: at }), s("line", { class: "nights-yes", x1: x - 5, x2: x + col + 5, y1: at, y2: at }));
    }
    const top = Math.min(y(n.room ?? 0), y(n.came ?? 0), y(n.rsvps));
    const [big, small] = figures(n);
    if (big) g.append(text(mid, top - 22, big, { class: n.kind === "upcoming" ? "nights-big nights-big-yes" : "nights-big", "text-anchor": "middle" }));
    g.append(
      text(mid, top - 7, small, { class: "nights-small", "text-anchor": "middle" }),
      text(mid, base + 20, n.weekday, { class: "nights-day", "text-anchor": "middle" }),
      text(mid, base + 38, n.day, { class: "nights-date", "text-anchor": "middle" }),
    );
    svg.append(g);
    return mid;
  });
  const free = width - shown.length * slot;
  if (free > HINT_ROOM) svg.append(text(shown.length * slot + 24, base - AREA / 2, "Each night you publish adds a column here.", { class: "nights-hint" }));
  const next = shown.findIndex((n) => n.kind === "upcoming");
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
