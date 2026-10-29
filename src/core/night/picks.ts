import type { CrowdSplit, QlooType, Rising } from "../../shared/contract.ts";
import { TYPE_PLURAL, TYPE_SINGULAR, possessive, shortName } from "../../shared/words.ts";
import { BALANCE_TOP, nearEven, splitOf } from "../joint/balance.ts";
import { bookRank, bundle } from "./books.ts";

// Qloo's popularity is a percentile across its catalogue. Below this, too few people know the pick to come out for it.
export const MIN_POPULARITY = 0.8;

// Whose pick it is: both crowds about evenly, one of the two crowds, or only the streets around the venue when Qloo
// could read neither place for this type.
export type PickSide = "both" | "venue" | "partner" | "area";

export interface Chosen {
  pick: Rising;
  split: CrowdSplit | null;
  // False when no joint pick sat near half and half, so the pick says whose it is instead.
  joint: boolean;
  side: PickSide;
  // Qloo could not read the partner for this type, so the joint list is the venue's crowd alone.
  partnerUnread?: boolean;
}

// Popularity to the hundredth, as Qloo's percentile reads; a pick with none goes after the ones that have it.
function known(r: Rising): number {
  return r.popularity === undefined ? -1 : Math.round(r.popularity * 100);
}

function offEven(c: Chosen): number {
  return c.split ? Math.abs(c.split.venue - 50) : 99;
}

// Inside the near even band people come for what they know, so the better known pick wins, then the more even, then rank.
// A book club takes a story, a life or essays before anything else, and a textbook last.
export function byPull(a: Chosen, b: Chosen): number {
  return bookRank(a.pick) - bookRank(b.pick) || known(b.pick) - known(a.pick) || offEven(a) - offEven(b) || a.pick.rank - b.pick.rank;
}

function words(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

// A night about a book called after one of the two places reads like an advert, so those picks go.
export function namesVenue(pick: Pick<Rising, "name">, places: string[]): boolean {
  const p = words(pick.name);
  return places.some((name) => {
    const n = words(shortName(name));
    return n.length >= 4 && (p.includes(n) || (p.length >= 4 && n.includes(p)));
  });
}

export function usable(r: Rising, places: string[]): boolean {
  if (!r.name.trim() || namesVenue(r, places) || (r.type === "book" && bundle(r.name))) return false;
  return r.popularity === undefined || r.popularity >= MIN_POPULARITY;
}

// Within one joint list: the usable picks in the top ten whose split is near half and half, the ones people would come for first.
export function evenPicks(joint: Rising[], type: QlooType, venueId: string, partnerId: string, places: string[]): Chosen[] {
  return joint
    .filter((r) => r.type === type && r.rank <= BALANCE_TOP && usable(r, places))
    .flatMap((pick) => {
      const split = splitOf(pick, venueId, partnerId);
      return split && nearEven(split) ? [{ pick, split, joint: true, side: "both" as const }] : [];
    })
    .sort(byPull);
}

export function ownPicks(rising: Rising[], type: QlooType, places: string[]): Chosen[] {
  return rising
    .filter((r) => r.type === type && usable(r, places))
    .map((pick) => ({ pick, split: null, joint: false, side: pick.venueSignal === false ? ("area" as const) : ("venue" as const) }))
    .sort(byPull);
}

export interface Place {
  id: string;
  name: string;
}

// When Qloo cannot read one of the two places for a type, the joint list is the other crowd's alone.
function oneSided(joint: Rising[], type: QlooType, venue: Place, partner: Place, places: string[]): Chosen[] {
  return joint
    .filter((r) => r.type === type && r.rank <= BALANCE_TOP && usable(r, places) && !splitOf(r, venue.id, partner.id))
    .flatMap((pick): Chosen[] => {
      const ids = (pick.explain ?? []).map((x) => x.entityId.toUpperCase());
      const v = ids.includes(venue.id.toUpperCase());
      const p = ids.includes(partner.id.toUpperCase());
      if (v === p) return [];
      return [v ? { pick, split: null, joint: false, side: "venue", partnerUnread: true } : { pick, split: null, joint: false, side: "partner" }];
    })
    .sort(byPull);
}

// The picks both crowds share evenly, then one crowd's when Qloo could read only one place, then the venue's own, each once.
export function ranked(type: QlooType, joint: Rising[], own: Rising[], venue: Place, partner: Place): Chosen[] {
  const places = [venue.name, partner.name];
  const out: Chosen[] = [];
  const add = (cs: Chosen[]) => {
    for (const c of cs) if (!out.some((o) => o.pick.id === c.pick.id)) out.push(c);
  };
  add(evenPicks(joint, type, venue.id, partner.id, places));
  add(oneSided(joint, type, venue, partner, places));
  add(ownPicks(own, type, places));
  return out;
}

export function fallbackNote(c: Pick<Chosen, "side" | "pick" | "partnerUnread">, venueName: string, partnerName: string): string {
  const v = shortName(venueName);
  const p = shortName(partnerName);
  const one = TYPE_SINGULAR[c.pick.type];
  const many = TYPE_PLURAL[c.pick.type];
  if (c.side === "partner") return `There is no read of ${v} for ${many}, so this ${one} is the pick of ${possessive(p)} crowd.`;
  if (c.partnerUnread) return `There is no read of ${p} for ${many}, so this ${one} is the pick of ${possessive(v)} own crowd.`;
  if (c.side === "area") return `There is no read of either place for ${many}, so this ${one} is one people around ${v} like, not a pick of either crowd.`;
  return `No ${one} splits the two crowds evenly enough, so this one is the pick of ${possessive(v)} own crowd.`;
}

export interface PickSet {
  chosen: Chosen[];
  notes: string[];
  // What ties the picks together, in a sentence the plan shows. Null when nothing does.
  link: string | null;
}

// The i-th night for each type the format needs: the joint pick when one is near even, otherwise the venue's own, said so.
export function pickSet(types: QlooType[], i: number, joint: Rising[], own: Rising[], venue: Place, partner: Place): PickSet | null {
  const chosen: Chosen[] = [];
  const notes: string[] = [];
  for (const type of types) {
    const list = ranked(type, joint, own, venue, partner);
    const best = Math.min(...list.map((c) => bookRank(c.pick)));
    const pick = list.filter((c) => bookRank(c.pick) === best)[i];
    if (!pick) return null;
    if (!pick.joint) notes.push(fallbackNote(pick, venue.name, partner.name));
    chosen.push(pick);
  }
  return { chosen, notes, link: null };
}
