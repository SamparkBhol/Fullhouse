import type { Night, NightLedger, PairLedger, ShareLinks, Venue, ViaCodes } from "../../shared/contract.ts";
import { randomId } from "../ids.ts";
import { titleWords } from "../slug.ts";
import { eventUrl } from "../pages/event.ts";

export type { ViaCodes } from "../../shared/contract.ts";

export const EMPTY_LEDGER: NightLedger = { fromVenue: 0, fromPartner: 0, direct: 0 };

// New nights get random codes, so a link names no place. Nights published before that keep the codes their links carry.
export function newViaCodes(night: Pick<Night, "match">, rand: () => string = () => randomId(8)): ViaCodes {
  return { venue: rand(), ...(night.match ? { partner: rand() } : {}) };
}

export function viaCodes(night: Pick<Night, "match" | "via">, venue: Pick<Venue, "entity">): ViaCodes {
  if (night.via) return night.via;
  const own = titleWords(venue.entity.name) || "venue";
  const theirs = night.match ? titleWords(night.match.partner.name) || "partner" : undefined;
  return theirs && theirs !== own ? { venue: own, partner: theirs } : { venue: own, ...(theirs ? { partner: `${theirs}-2` } : {}) };
}

export function shareLinks(origin: string, slug: string, codes: ViaCodes): ShareLinks {
  const base = eventUrl(origin, slug);
  return { venue: `${base}?via=${codes.venue}`, ...(codes.partner ? { partner: `${base}?via=${codes.partner}` } : {}) };
}

// Anything that is not one of the night's two codes counts as a guest who found the page some other way.
export function sideOf(via: string | null | undefined, codes: ViaCodes): keyof NightLedger {
  if (via && via === codes.venue) return "fromVenue";
  if (via && codes.partner && via === codes.partner) return "fromPartner";
  return "direct";
}

export function counted(ledger: NightLedger | undefined, side: keyof NightLedger): NightLedger {
  const l = { ...EMPTY_LEDGER, ...ledger };
  return { ...l, [side]: l[side] + 1 };
}

export function knownVia(via: string | null | undefined, codes: ViaCodes): string | undefined {
  return via && (via === codes.venue || via === codes.partner) ? via : undefined;
}

// Across every published night with the same partner, the RSVPs each side sent the other.
export function pairLedgers(nights: Night[]): PairLedger[] {
  const by = new Map<string, PairLedger>();
  for (const n of nights) {
    const p = n.match?.partner;
    if (!p || !n.ledger || n.withdrawnAt) continue;
    const key = p.id.toUpperCase();
    const row = by.get(key) ?? { partnerId: p.id, partnerName: p.name, nights: 0, sent: 0, received: 0 };
    row.nights += 1;
    row.sent += n.ledger.fromVenue;
    row.received += n.ledger.fromPartner;
    by.set(key, row);
  }
  return [...by.values()].sort((a, b) => b.sent + b.received - (a.sent + a.received));
}
