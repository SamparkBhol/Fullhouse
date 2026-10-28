import type { Gap, LovedPlace } from "../../../shared/contract.ts";
import { listWords } from "../../copy/text.ts";
import type { CompareRead, SideTag } from "../../qloo/compare.ts";
import { isNamespaceRoot, type QTag } from "../../qloo/tags.ts";
import { possessive } from "../words.ts";
import type { ReadContext } from "./resolve.ts";

export const MAX_GAPS = 6;
export const MIN_CARRIERS = 2;

// Compare lists every catalogue tag of the nearby places, repair services and hotel amenities included.
// Only these namespaces describe what a place is or offers for an evening, most useful first.
export const GAP_NAMESPACES = [
  "urn:tag:good_for:qloo",
  "urn:tag:event:place",
  "urn:tag:genre:place",
  "urn:tag:category:place",
  "urn:tag:offerings:place",
  "urn:tag:ambience:qloo",
  "urn:tag:cuisine:qloo",
];

// Qloo puts Tourist Attraction on landmarks, parks and venues alike, so it never tells a venue what to put on.
const CATALOGUE_NAMES = new Set(["tourist attraction"]);

function lower(s: string): string {
  return s.trim().toLowerCase();
}

export function isCatalogueTag(tag: Pick<QTag, "id" | "name" | "namespace">): boolean {
  return isNamespaceRoot(tag) || CATALOGUE_NAMES.has(lower(tag.name));
}

interface Candidate {
  tag: SideTag;
  carriers: string[];
  count: number;
}

// Compare's count and the partners' own tag lists can disagree, so the larger of the two is the count.
function candidate(t: SideTag, partners: LovedPlace[]): Candidate {
  const carriers = partners.filter((p) => p.tags.includes(t.id)).map((p) => p.name);
  return { tag: t, carriers, count: Math.min(partners.length, Math.max(t.count, carriers.length)) };
}

// A gap is a tag on the partners' side that the venue's side lacks, carried by at least two partners
// so one odd neighbour (a fabric store's repair service) does not set the direction.
function gapCandidates(compare: CompareRead, partners: LovedPlace[], ctx: ReadContext): Candidate[] {
  const ownIds = new Set([...ctx.ownTags, ...compare.a.map((t) => t.id)]);
  const ownNames = new Set(compare.a.map((t) => lower(t.name)));
  const minCarriers = Math.min(MIN_CARRIERS, partners.length);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const t of compare.b) {
    const name = lower(t.name);
    if (!GAP_NAMESPACES.includes(t.namespace) || isCatalogueTag(t) || ownIds.has(t.id) || ownNames.has(name) || seen.has(name)) continue;
    const c = candidate(t, partners);
    if (c.count < minCarriers) continue;
    seen.add(name);
    out.push(c);
  }
  const ns = (c: Candidate) => GAP_NAMESPACES.indexOf(c.tag.namespace);
  return out.map((c, i) => ({ c, i })).sort((a, b) => b.c.count - a.c.count || ns(a.c) - ns(b.c) || a.i - b.i).map((x) => x.c);
}

function carriedBy(count: number, n: number): string {
  return n === 1 ? "The one place" : `${count} of the ${n} places`;
}

export function partnerGaps(compare: CompareRead, partners: LovedPlace[], ctx: ReadContext, ref: number): Gap[] {
  const n = partners.length;
  return gapCandidates(compare, partners, ctx)
    .slice(0, MAX_GAPS)
    .map(({ tag: t, carriers, count }, i): Gap => {
      const which = carriers.length ? `Tagged ${t.name}: ${listWords(carriers)}` : `${t.name} is on ${count} of the ${n} nearby places Qloo compared with ${ctx.name}`;
      return {
        tag: { id: t.id, name: t.name, namespace: t.namespace, rank: i + 1 },
        note: `${carriedBy(count, n)} nearby that ${possessive(ctx.name)} audience also loves ${count === 1 ? "is" : "are"} tagged ${t.name}. ${ctx.name} is not.`,
        because: [
          { kind: "compare", text: which, provenance: ref },
          { kind: "compare", text: `${possessive(ctx.name)} own Qloo tags do not include ${t.name}`, provenance: ref },
        ],
      };
    });
}
