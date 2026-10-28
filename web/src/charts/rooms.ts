import { niceMax } from "./scale.ts";
import { s, text } from "./svg.ts";

export interface RoomRow {
  label: string;
  note: string;
  room?: number;
  came?: number;
  rsvps: number;
}

const ROW = 58;
const NOTE_ROW = 20;
const LABEL_Y = 16;
const BAR_Y = 26;
const BAR_H = 20;
// Archivo at width 80 and 14 px averages a little under this per character.
const CHAR_PX = 6.8;

// How full was the house: the box is the room, the filled bar is who came, the yellow mark is who said yes.
// Every value is also written beside its bar, so no number hides behind a hover. On a narrow phone the
// numbers move under the bar instead of running into the date.
export function roomBars(rows: RoomRow[], width: number): SVGSVGElement {
  const max = niceMax(Math.max(1, ...rows.flatMap((r) => [r.room ?? 0, r.came ?? 0, r.rsvps])));
  const x = (v: number) => Math.round((v / max) * (width - 4)) + 2;
  const longest = Math.max(0, ...rows.map((r) => r.label.length + r.note.length));
  const below = longest * CHAR_PX + 16 > width;
  const row = below ? ROW + NOTE_ROW : ROW;
  const height = rows.length * row;
  const svg = s("svg", { class: "chart rooms", width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true", focusable: "false" });
  rows.forEach((r, i) => {
    const top = i * row;
    svg.append(
      text(2, top + LABEL_Y, r.label, { class: "row-label" }),
      below ? text(2, top + BAR_Y + BAR_H + 18, r.note, { class: "row-note" }) : text(width - 2, top + LABEL_Y, r.note, { class: "row-note", "text-anchor": "end" }),
    );
    if (r.room) svg.append(s("rect", { class: "room-box", x: 2, y: top + BAR_Y, width: x(r.room) - 2, height: BAR_H }));
    else svg.append(s("line", { class: "baseline", x1: 2, x2: width - 2, y1: top + BAR_Y + BAR_H, y2: top + BAR_Y + BAR_H }));
    if (r.came) svg.append(s("rect", { class: "bar bar-solid", x: 2, y: top + BAR_Y + 4, width: Math.max(2, x(r.came) - 2), height: BAR_H - 8 }));
    if (r.rsvps) svg.append(s("rect", { class: "rsvp-tick", x: x(r.rsvps) - 2, y: top + BAR_Y - 5, width: 4, height: BAR_H + 10 }));
  });
  return svg;
}
