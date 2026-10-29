import type { Gap, LovedPlace, QlooType, Rising } from "../../../src/shared/contract.ts";
import { capFirst, ordinal } from "../../../src/shared/words.ts";
import { prettyTag } from "../format.ts";

export type CoverShape = "square" | "portrait";

// Record sleeves, podcast tiles and shop photos are square; books, posters and box art stand portrait.
export function shapeOf(type: QlooType): CoverShape {
  return type === "artist" || type === "podcast" || type === "place" || type === "brand" || type === "person" ? "square" : "portrait";
}

// A pick carries only its place in its list. A list answered for the area alone has no taste rank, so it says so instead.
export function pickLine(r: Pick<Rising, "rank" | "venueSignal">): string {
  return r.venueSignal === false ? "Liked around you, not ranked" : ordinal(r.rank);
}

// The planner writes "About 400 m from <venue>, tagged Jazz, which ..."; the card already shows the walk, so it keeps the rest.
export function partnerReason(p: Pick<LovedPlace, "rank" | "because">, venueName: string): string {
  const marker = `from ${venueName}, `;
  for (const b of p.because.slice(1)) {
    const at = b.text.indexOf(marker);
    if (at >= 0) return capFirst(b.text.slice(at + marker.length).trim());
  }
  return `${ordinal(p.rank)} nearby for your audience`;
}

// The read names each layer in full ("Where the taste for Caffe Reggio runs strongest"); the switch over the map
// needs only who it follows, so both fit one row on a phone.
export function layerWord(label: string): string {
  if (/^Where the taste for .+ runs strongest$/.test(label)) return "Your crowd";
  if (/^Where places like .+ run strongest$/.test(label)) return "Places like yours";
  return label;
}

export interface BoardLine {
  text: string;
  note?: string;
  count?: string;
}

const GAP_NOTE = /^(\d+) of the (\d+) places nearby that (.+) also loves (?:is|are) tagged .+\.$/;
const ONE_PLACE = /^The one place nearby that (.+) also loves is tagged .+\.$/;

// Every gap note repeats one sentence with only the count changing, so the panel says it once and each tag keeps its count.
export function gapLines(gaps: Gap[]): { intro?: string; lines: BoardLine[] } {
  const one = gaps.map((g) => ONE_PLACE.exec(g.note));
  const who = one[0]?.[1];
  if (gaps.length > 1 && who && one.every((m) => m?.[1] === who)) {
    return { intro: `The one place nearby that ${who} also loves carries each of these tags. Your venue carries none of them.`, lines: gaps.map((g) => ({ text: prettyTag(g.tag.name) })) };
  }
  const parsed = gaps.map((g) => GAP_NOTE.exec(g.note));
  const first = parsed[0];
  const same = first && parsed.every((m) => m && m[2] === first[2] && m[3] === first[3]);
  if (!same || !first) return { lines: gaps.map((g) => ({ text: prettyTag(g.tag.name), note: g.note })) };
  return {
    intro: `Of the ${first[2]} places nearby that ${first[3]} also loves, how many carry each tag. Your venue carries none of them.`,
    lines: gaps.map((g, i) => ({ text: prettyTag(g.tag.name), count: `${parsed[i]?.[1]} of ${first[2]}` })),
  };
}
