import type { LovedPlace, Venue } from "../../shared/contract.ts";
import { canHost, distinctKinds, hostKinds } from "../street/hosts.ts";

export const MATCH_CANDIDATES = 3;

// Restaurant and event venue sit on almost every place that serves anything, so they never make two places rivals.
const GENERIC = new Set(["restaurant", "event_venue"]);

// Two bookshops, or two cafes, are after the same customers; a bookshop and a cinema, or a cafe and a bar, are not.
export function competes(p: Pick<LovedPlace, "tags">, venue: Pick<Venue, "entity">): boolean {
  const mine = distinctKinds(venue.entity);
  const theirs = distinctKinds(p);
  if (mine.size || theirs.size) return [...theirs].some((k) => mine.has(k));
  const own = new Set(hostKinds(venue.entity).filter((k) => !GENERIC.has(k)));
  return hostKinds(p).some((k) => own.has(k));
}

// Places that host people, in Qloo's order, with direct competitors after the rest.
export function matchCandidates(places: LovedPlace[], venue: Pick<Venue, "entity">, n = MATCH_CANDIDATES): LovedPlace[] {
  const hosts = places.filter((p) => canHost(p) && p.id.toUpperCase() !== venue.entity.id.toUpperCase());
  const byRank = [...hosts].sort((a, b) => a.rank - b.rank);
  return [...byRank.filter((p) => !competes(p, venue)), ...byRank.filter((p) => competes(p, venue))].slice(0, n);
}
