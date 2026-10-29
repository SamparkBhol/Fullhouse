import type { Because, CrowdSplit, Match, NightFormat, NightHost, Venue } from "../../shared/contract.ts";
import { listWords, plainName } from "../../shared/words.ts";
import { FORMATS } from "../planner/formats.ts";
import type { Balanced } from "./balance.ts";

export function splitText(split: CrowdSplit, venueName: string, partnerName: string): string {
  return `${plainName(venueName)} crowd ${split.venue}, ${plainName(partnerName)} crowd ${split.partner}`;
}

export function splitBecause(b: Balanced, venue: Venue, match: Match): Because | null {
  const prov = b.pick.because[0]?.provenance;
  if (prov === undefined) return null;
  return {
    kind: "explainability",
    text: `${splitText(b.split, venue.entity.name, match.partner.name)}, from Qloo's explainability for ${b.pick.name} with both places as the signal`,
    provenance: prov,
  };
}

export function sharedBecause(match: Match): Because | null {
  const tags = match.shared.slice(0, 3).map((t) => t.name);
  const prov = match.provenance[1] ?? match.provenance[0];
  if (!tags.length || prov === undefined) return null;
  return { kind: "compare", text: `Both crowds go for ${listWords(tags)}`, provenance: prov };
}

export function hostLine(host: NightHost, format: NightFormat, venue: Venue, match: Match): Because | null {
  const prov = match.provenance[0];
  if (prov === undefined) return null;
  const v = plainName(venue.entity.name);
  const p = plainName(match.partner.name);
  const label = FORMATS[format].label;
  const text =
    host === "partner"
      ? `A ${label} suits ${p}, so ${p} hosts it and both names go on it once ${p} says yes`
      : host === "venue"
        ? `A ${label} suits ${v}, so ${v} hosts it and both names go on it once ${p} says yes`
        : `${v} hosts it, and both names go on it once ${p} says yes`;
  return { kind: "tag", text, provenance: prov };
}
