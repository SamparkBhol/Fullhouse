import type { QlooType, Rising, StreetRead } from "../../../src/shared/contract.ts";
import { h, uid } from "../dom.ts";
import { displayTitle } from "../format.ts";
import { byLine } from "../joint.ts";
import { cover } from "./cover.ts";

const KINDS: Array<[QlooType, string]> = [
  ["book", "Book"],
  ["movie", "Film"],
  ["artist", "Artist"],
];

function top(read: StreetRead, type: QlooType): Rising | undefined {
  return read.rising.filter((r) => r.type === type && r.venueSignal !== false).sort((a, b) => a.rank - b.rank)[0];
}

// The crowd's first book, film and artist, as a short row of evidence under the pair. The full crowd is on the Street tab.
export function evidenceRow(read: StreetRead | null | undefined, venueName: string): HTMLElement | null {
  if (!read) return null;
  const picks = KINDS.flatMap(([type, word]) => {
    const r = top(read, type);
    return r ? [{ r, word }] : [];
  });
  if (!picks.length) return null;
  const id = uid("evidence");
  return h(
    "section",
    { class: "evidence", "aria-labelledby": id },
    h("h2", { id }, `What people who like ${venueName} love beyond the street`),
    h(
      "ul",
      { class: "evidence-list" },
      picks.map(({ r, word }) => {
        const by = byLine(r);
        return h(
          "li",
          { class: "evidence-item" },
          cover(r, { shape: r.type === "artist" ? "square" : "portrait" }),
          h("p", { class: "evidence-name" }, displayTitle(r.name), h("span", { class: "evidence-sub" }, by && r.type !== "artist" ? `${word} by ${by}` : word)),
        );
      }),
    ),
  );
}
