import type { Because } from "../../shared/contract.ts";
import type { QEntity } from "../qloo/entities.ts";
import { sameId } from "../qloo/values.ts";
import type { Fingerprint } from "./steps/fingerprint.ts";
import type { ReadContext } from "./steps/resolve.ts";
import { sharesStreetTagLine } from "./words.ts";

// An explained result lists the venue among the signal entities when Qloo used the venue for it.
// An answer where nothing is explained means the venue part was dropped.
export function tiedToVenue(e: QEntity, ctx: ReadContext): boolean {
  return e.explain.some((r) => sameId(r.entityId, ctx.entityId));
}

// One line per result. The wording follows whether Qloo used the venue for the list at all; the kind records
// whether explainability tied this one result to the venue.
export function rankBecause(text: { ranked: string; area: string }, e: QEntity, listTied: boolean, ctx: ReadContext, ref: number): Because {
  return { kind: tiedToVenue(e, ctx) ? "explainability" : "affinity", text: listTied ? text.ranked : text.area, provenance: ref };
}

// Ambience tags and book formats sit near level on every place and book, so they explain nothing.
const SAYS_NOTHING_NS = new Set(["urn:tag:ambience:qloo"]);
const FORMAT_NAMES = /^(audiobook|e ?book|hardcover|paperback|mass market|kindle)/i;

function explains(tag: { id: string; name: string; namespace: string }): boolean {
  return !SAYS_NOTHING_NS.has(tag.namespace) && !FORMAT_NAMES.test(tag.name.trim());
}

// Only a tag both the street and the venue's own audience carry is worth naming as a reason.
export function streetTagBecause(tagIds: string[], street: Fingerprint | null, audience: Fingerprint | null, venueName: string): Because[] {
  if (!street || !audience) return [];
  const ids = new Set(tagIds);
  const own = new Set(audience.tags.map((t) => t.id));
  const hit = street.tags.find((s) => ids.has(s.id) && own.has(s.id) && explains(s));
  return hit ? [{ kind: "tag", text: sharesStreetTagLine(hit.name, venueName), provenance: street.ref }] : [];
}

export function withStreetTags<T extends { tags?: string[]; because: Because[] }>(
  items: T[],
  street: Fingerprint | null,
  audience: Fingerprint | null,
  venueName: string,
): T[] {
  return items.map((item) => ({ ...item, because: [...item.because, ...streetTagBecause(item.tags ?? [], street, audience, venueName)] }));
}
