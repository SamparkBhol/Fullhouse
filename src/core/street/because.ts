import type { Because } from "../../shared/contract.ts";
import type { QEntity } from "../qloo/entities.ts";
import { sameId } from "../qloo/values.ts";
import type { Fingerprint } from "./steps/fingerprint.ts";
import type { ReadContext } from "./steps/resolve.ts";

// With the venue as the only entity signal every explained result scores 1 for it, so the useful fact is
// whether Qloo used the venue at all. An answer where nothing is explained means the venue part was dropped.
export function tiedToVenue(e: QEntity, ctx: ReadContext): boolean {
  return e.explain.some((r) => sameId(r.entityId, ctx.entityId));
}

export function explainBecause(e: QEntity, ctx: ReadContext, ref: number, what: string): Because[] {
  if (!tiedToVenue(e, ctx)) return [];
  return [{ kind: "explainability", text: `Qloo's explainability ties this ${what} to ${ctx.name}`, provenance: ref }];
}

export function streetTagBecause(tagIds: string[], street: Fingerprint | null): Because[] {
  if (!street) return [];
  const ids = new Set(tagIds);
  const hit = street.tags.find((s) => ids.has(s.id));
  if (!hit) return [];
  return [{ kind: "tag", text: `Tagged ${hit.name}, which ranks #${hit.rank} in the street's taste profile`, provenance: street.ref }];
}

export function withStreetTags<T extends { tags?: string[]; because: Because[] }>(items: T[], street: Fingerprint | null): T[] {
  return items.map((item) => ({ ...item, because: [...item.because, ...streetTagBecause(item.tags ?? [], street)] }));
}
