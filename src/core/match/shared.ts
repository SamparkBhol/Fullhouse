import type { StreetTag } from "../../shared/contract.ts";
import type { CompareRead } from "../qloo/compare.ts";
import { cleanTagName, type QTag } from "../qloo/tags.ts";
import { renumber, tagKeys, uniqueBy } from "../street/rank.ts";
import { isCatalogueTag } from "../street/steps/gaps.ts";

export const MAX_SHARED = 10;

// Only tags that say what a crowd goes for, most telling first. Payment, cost, health and seating tags describe the building.
const SHARED_NS = [
  "urn:tag:genre:music",
  "urn:tag:genre:media",
  "urn:tag:keyword:media",
  "urn:tag:ambience:qloo",
  "urn:tag:characteristic:place",
  "urn:tag:good_for:qloo",
  "urn:tag:offerings:place",
  "urn:tag:cuisine:qloo",
  "urn:tag:genre:place",
  "urn:tag:category:place",
];

const IDENTITY = /\b(lgbt\w*|queer|gay|lesbian|trans|transgender|race|racial|female|male|women\w*|men|mens|black|african|latin[aox]?|latinx|asian american|jewish|feminis\w*|gender|sexuality|identifies)\b/;

// Ages, formats and the plainest kinds of place come back for almost every pair, so they say nothing about these two.
const SAYS_NOTHING = new Set([
  "adult", "young adult", "contemporary", "kids", "children", "teen", "audiobook", "ebook", "paperback", "hardcover",
  "fiction", "nonfiction", "place", "food", "restaurant", "event venue", "shopping", "tourist attraction", "drinks", "alcohol",
]);

function plain(name: string): string {
  return cleanTagName(name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function shareable(tag: Pick<StreetTag, "id" | "name" | "namespace">): boolean {
  const name = plain(tag.name);
  return Boolean(name) && SHARED_NS.includes(tag.namespace) && !isCatalogueTag(tag) && !IDENTITY.test(name) && !SAYS_NOTHING.has(name);
}

function fromQ(t: QTag): StreetTag {
  return { id: t.id, name: cleanTagName(t.name) || t.name, namespace: t.namespace, rank: 0 };
}

// What both crowds share: compare's shared tags, tags on both sides of compare, and tags that rank in both crowds'
// own taste reads by their combined rank, shown kind by kind with music and screen tastes first.
export function sharedTags(compare: CompareRead | null, venueTags: StreetTag[], partnerTags: StreetTag[]): StreetTag[] {
  const fromCompare = compare ? [...compare.shared.map(fromQ), ...compare.a.filter((a) => compare.b.some((b) => b.id === a.id)).map(fromQ)] : [];
  const partnerRank = new Map(partnerTags.map((t) => [t.id, t.rank]));
  const both = venueTags
    .filter((t) => partnerRank.has(t.id))
    .map((t) => ({ t, score: t.rank + (partnerRank.get(t.id) ?? 0) }))
    .sort((a, b) => a.score - b.score || a.t.rank - b.t.rank)
    .map((x) => ({ ...x.t, name: cleanTagName(x.t.name) || x.t.name }));
  const kept = uniqueBy([...fromCompare, ...both].filter(shareable), tagKeys);
  const ns = (t: StreetTag) => SHARED_NS.indexOf(t.namespace);
  return renumber(kept.map((t, i) => ({ t, i })).sort((a, b) => ns(a.t) - ns(b.t) || a.i - b.i).map((x) => x.t).slice(0, MAX_SHARED));
}
