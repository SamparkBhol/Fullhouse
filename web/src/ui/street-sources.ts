import type { Because, QlooType, Rising, StreetRead } from "../../../src/shared/contract.ts";
import { MIN_CARRIERS } from "../../../src/shared/engine.ts";
import { numberWord } from "../../../src/shared/words.ts";
import { TREND_WORDS, distance, prettyTag } from "../format.ts";
import { ownReasons, sharedLine } from "./lists.ts";
import { sourcePart, type SourcePart } from "./sources.ts";

const TYPE_HEADINGS: Partial<Record<QlooType, string>> = { artist: "Artists", book: "Books", movie: "Films", tv_show: "TV shows", podcast: "Podcasts", videogame: "Video games" };

function byType(read: StreetRead): [QlooType, Rising[]][] {
  const types = [...new Set(read.rising.map((r) => r.type))];
  return types.map((t) => [t, read.rising.filter((r) => r.type === t).sort((a, b) => a.rank - b.rank)]);
}

// The weekly series held flat on this host, so a trend is told only when one actually moved.
function pickParts(read: StreetRead): SourcePart[] {
  return byType(read).map(([type, picks]) => {
    const shared = sharedLine(picks);
    const own: Because[] = picks.flatMap((r) => [
      ...ownReasons(r, shared).map((b) => ({ ...b, text: `${r.name}. ${b.text}` })),
      ...(r.trend !== "unknown" ? [{ kind: "trending" as const, text: `${r.name}. ${TREND_WORDS[r.trend]}${r.trendNote ? `, ${r.trendNote}` : ""}`, provenance: -1 }] : []),
    ]);
    return { heading: TYPE_HEADINGS[type] ?? type, because: [...(shared ? [shared] : []), ...own], nested: true };
  });
}

export function mapPart(read: StreetRead, tz: string): HTMLElement {
  return sourcePart({
    heading: "The map",
    plain: ["Each square is one cell of the heat map. Its shade follows the cell's place in that one answer, darkest first, so two maps never compare by shade.", "Where pins sit close together they are spread out, with a thin line back to the real spot."],
    parts: read.heat.map((l) => ({ because: [{ text: `Heat map. ${l.label}`, kind: "heatmap" as const, provenance: l.provenance }] })),
    calls: read.provenance,
    callNames: ["loved_places"],
    tz,
  });
}

export function picksPart(read: StreetRead, venueName: string, tz: string): HTMLElement {
  const areaOnly = read.rising.some((r) => r.venueSignal === false);
  return sourcePart({
    heading: "What they love beyond the street",
    plain: [
      `One list per kind for people who like ${venueName}, read with the streets around it. The number beside each pick is its place in that list, so 1st is the strongest tie. It is a rank inside one answer, not a score.`,
      ...(areaOnly ? ["A pick with no rank came back without your venue in it, so it shows what the area likes in no order of taste."] : []),
    ],
    parts: pickParts(read),
    calls: read.provenance,
    tz,
  });
}

export function lovedPart(read: StreetRead, venueName: string, tz: string): HTMLElement | null {
  const loved = read.lovedPlaces;
  if (!loved.length) return null;
  const shared = sharedLine(loved);
  return sourcePart({
    heading: "The places nearby",
    plain: [`The places within ${distance(read.radiusM)} that people who like ${venueName} also love, strongest first. Walks are the straight line distance with a detour allowance, at an easy pace.`],
    parts: [
      { because: shared ? [shared] : [] },
      { heading: "Each place", nested: true, because: loved.flatMap((p) => ownReasons(p, shared).map((b) => ({ ...b, text: `${p.name}. ${b.text}` }))) },
    ],
    calls: read.provenance,
    tz,
  });
}

export function gapPart(read: StreetRead, tz: string): HTMLElement {
  return sourcePart({
    heading: "What the places your crowd loves have that you do not",
    plain: [`Your venue's tags against the tags of the places your crowd loves most nearby. A gap is a tag ${numberWord(MIN_CARRIERS)} or more of them carry and you do not.`],
    parts: read.gaps.map((g) => ({ heading: prettyTag(g.tag.name), because: g.because })),
    calls: read.provenance,
    callNames: ["compare"],
    tz,
  });
}

export function tagsPart(read: StreetRead, venueName: string, tz: string): HTMLElement {
  return sourcePart({
    heading: `What ${venueName} is liked for`,
    plain: [`Your tags come from asking about ${venueName} itself. Menu items, service words and tags most of the street carries are dropped, and the rest are ordered rarest on the street first.`],
    calls: read.provenance,
    callNames: ["street_tags", "venue_tags"],
    tz,
  });
}
