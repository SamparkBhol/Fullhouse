import type { StreetRead } from "../../../src/shared/contract.ts";
import { h } from "../dom.ts";
import { distance, prettyTag } from "../format.ts";
import { receiptPart } from "./fold.ts";
import { ownReasons, sharedLine } from "./lists.ts";
import { pickParts } from "./picks.ts";
import { tagColumns } from "./taste.ts";

export function mapPart(read: StreetRead, tz: string): HTMLElement {
  return receiptPart({
    heading: "The night map",
    plain: [
      "Each window is one cell of Qloo's heat map. Its light follows the cell's place in that one answer, brightest first, so two layers never compare by brightness.",
      "Where photos sit close together they are spread out, with a thin line back to the real spot.",
    ],
    parts: read.heat.map((l) => ({ because: [{ text: `Heat map. ${l.label}`, kind: "heatmap" as const, provenance: l.provenance }] })),
    calls: read.provenance,
    callNames: ["loved_places"],
    tz,
  });
}

export function picksPart(read: StreetRead, venueName: string, tz: string): HTMLElement {
  const areaOnly = read.rising.some((r) => r.venueSignal === false);
  return receiptPart({
    heading: "The picks on the shelves",
    plain: [
      `Qloo answered one list per kind for people who like ${venueName}, read with the streets around it. The line under each cover gives its position in that list, so 1st is the strongest tie. It is a rank inside one answer, not a score.`,
      ...(areaOnly ? ["A list marked not ranked came back without your venue in it, so it shows what the area likes in no order of taste."] : []),
      "Where Qloo used more than one place to answer, it says how much of a pick comes through each one. That split is written below as a share out of 1.",
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
  return receiptPart({
    heading: "The places nearby",
    plain: [
      `Qloo listed the places within ${distance(read.radiusM)} that people who like ${venueName} also love, strongest first. Walking times are straight line distance at an easy pace, so the real walk can be longer.`,
    ],
    parts: [
      { because: shared ? [shared] : [] },
      { heading: "Each place", nested: true, because: loved.flatMap((p) => ownReasons(p, shared).map((b) => ({ ...b, text: `${p.name}. ${b.text}` }))) },
    ],
    calls: read.provenance,
    tz,
  });
}

export function gapPart(read: StreetRead, tz: string): HTMLElement {
  return receiptPart({
    heading: "Found nearby, not here",
    plain: ["Qloo compared your venue's tags with the tags of the places your audience loves most nearby. A gap is a tag two or more of them carry and you do not."],
    parts: read.gaps.map((g) => ({ heading: prettyTag(g.tag.name), because: g.because })),
    calls: read.provenance,
    callNames: ["compare"],
    tz,
  });
}

export function tastePart(read: StreetRead, venueName: string, tz: string): HTMLElement {
  return receiptPart(
    {
      heading: "What the street likes, and what you are liked for",
      plain: [
        "The street's tags come from asking Qloo about the location alone. It scores them almost level, so they are a set in no order.",
        `Your tags come from asking about ${venueName} itself, and those are ranked, 1 first. Marked tags are in both.`,
      ],
      calls: read.provenance,
      callNames: ["street_tags", "venue_tags"],
      tz,
    },
    tagColumns(read, venueName),
  );
}

export function audiencePart(read: StreetRead, venueName: string, tz: string): HTMLElement | null {
  if (!read.demographics) return null;
  return receiptPart(
    {
      heading: "Who your audience is, in aggregate",
      plain: [`Qloo's demographics for people who like ${venueName}. It describes an audience, not any person, and it does not change with the street.`],
      parts: [{ because: [{ text: "Qloo demographics for your venue's audience", kind: "demographics", provenance: read.demographics.provenance }] }],
      calls: read.provenance,
      tz,
    },
    h("p", { class: "fold-plain fold-fact" }, read.demographics.summary),
  );
}
