import type { LovedPlace } from "../../shared/contract.ts";

// The namespaces that say what kind of place something is.
export const KIND_NAMESPACES = ["urn:tag:genre:place", "urn:tag:category:place"];

// Landmarks, stairways, offices and parks come back as loved places too, but nobody there answers a partner note.
const HOST_KINDS = /(cafe|coffee|bar|pub|restaurant|bistro|bakery|brewery|brewpub|winery|theater|theatre|cinema|movie|club|venue|book|record|music|gallery|museum|store|shop|studio|hall)/;

export function isKindTag(tagId: string): boolean {
  return KIND_NAMESPACES.some((ns) => tagId.startsWith(`${ns}:`));
}

export function kindsOf(p: Pick<LovedPlace, "tags">): string[] {
  return p.tags.filter(isKindTag).map((t) => t.split(":").pop() ?? "");
}

export function canHost(p: Pick<LovedPlace, "tags" | "url">): boolean {
  return Boolean(p.url) && kindsOf(p).some((k) => HOST_KINDS.test(k));
}
