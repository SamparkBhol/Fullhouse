import type { QlooType, Rising } from "../../shared/contract.ts";
import { shortTitle } from "../copy/text.ts";
import { fallbackNote, ranked, type Chosen, type Place, type PickSet } from "./picks.ts";

const ART = /^urn:tag:(keyword:(media|qloo)|theme:qloo|interests:qloo):(.*_)?(art|artists?|painters?|paintings?|photograph|photographers?|photography|portraits?|portraitist|museum|gallery|sculptors?|sculpture|exhibition)(_.*)?$/;
const PLAIN = /^urn:tag:keyword:qloo:([a-z]+)$/;

// Qloo files Portrait of a Lady on Fire under painting, painters and portraits 31 times and The French Dispatch 15 times,
// while a film with one painter in it gets a handful. A dozen is a film about art.
export const ART_AT_LEAST = 12;

export function artTags(r: Pick<Rising, "tags">): string[] {
  return (r.tags ?? []).filter((t) => ART.test(t));
}

function aboutArt(c: Chosen): boolean {
  return artTags(c.pick).length >= ART_AT_LEAST;
}

// "painting", from the plainest of the art tags.
export function artWord(r: Pick<Rising, "tags">): string | null {
  const plain = artTags(r).map((t) => PLAIN.exec(t)?.[1]).find((w): w is string => Boolean(w));
  return plain ?? null;
}

// A late view runs straight into a film or a book about art when both crowds share one; otherwise the usual order.
export function artPickSet(type: QlooType, i: number, joint: Rising[], own: Rising[], venue: Place, partner: Place): PickSet | null {
  const list = ranked(type, joint, own, venue, partner);
  const art = list.filter(aboutArt).sort((a, b) => artTags(b.pick).length - artTags(a.pick).length);
  const ordered = [...art, ...list.filter((c) => !aboutArt(c))];
  const pick = ordered[i];
  if (!pick) return null;
  const word = aboutArt(pick) ? artWord(pick.pick) : null;
  const link = word ? `${shortTitle(pick.pick.name)} is about ${word.replace(/_/g, " ")}, so the late view carries straight on into it.` : null;
  return { chosen: [pick], notes: pick.joint ? [] : [fallbackNote(pick, venue.name, partner.name)], link };
}
