import type { Because } from "../../shared/contract.ts";
import type { QEntity } from "../qloo/entities.ts";
import { sameId } from "../qloo/values.ts";
import type { Fingerprint } from "./steps/fingerprint.ts";
import type { ReadContext } from "./steps/resolve.ts";
import { sharesStreetTagLine } from "./words.ts";

// With the venue as the only entity signal every explained result scores 1 for it, so the useful fact is
// whether Qloo used the venue at all. An answer where nothing is explained means the venue part was dropped.
export function tiedToVenue(e: QEntity, ctx: ReadContext): boolean {
  return e.explain.some((r) => sameId(r.entityId, ctx.entityId));
}

// One line per result. The wording follows whether Qloo used the venue for the list at all; the kind records
// whether explainability tied this one result to the venue.
export function rankBecause(text: { ranked: string; area: string }, e: QEntity, listTied: boolean, ctx: ReadContext, ref: number): Because {
  return { kind: tiedToVenue(e, ctx) ? "explainability" : "affinity", text: listTied ? text.ranked : text.area, provenance: ref };
}

export function streetTagBecause(tagIds: string[], street: Fingerprint | null, venueName: string): Because[] {
  if (!street) return [];
  const ids = new Set(tagIds);
  const hit = street.tags.find((s) => ids.has(s.id));
  return hit ? [{ kind: "tag", text: sharesStreetTagLine(hit.name, venueName), provenance: street.ref }] : [];
}

export function withStreetTags<T extends { tags?: string[]; because: Because[] }>(items: T[], street: Fingerprint | null, venueName: string): T[] {
  return items.map((item) => ({ ...item, because: [...item.because, ...streetTagBecause(item.tags ?? [], street, venueName)] }));
}
