import type { Gap, LovedPlace } from "../../../shared/contract.ts";
import { listWords } from "../../copy/text.ts";
import type { CompareRead, SideTag } from "../../qloo/compare.ts";
import { isNamespaceRoot } from "../../qloo/tags.ts";
import type { ReadContext } from "./resolve.ts";

export const MAX_GAPS = 6;

// Compare lists every catalogue tag of the nearby places, hotel amenities and room types included.
// Only these namespaces describe something a venue could put on for one night.
export const GAP_NAMESPACES = [
  "urn:tag:good_for:qloo",
  "urn:tag:offerings:place",
  "urn:tag:event:place",
  "urn:tag:ambience:qloo",
  "urn:tag:cuisine:qloo",
  "urn:tag:dining_option:qloo",
  "urn:tag:genre:place",
];

function lower(s: string): string {
  return s.trim().toLowerCase();
}

function partnerCandidates(compare: CompareRead, ctx: ReadContext): SideTag[] {
  const ownIds = new Set([...ctx.ownTags, ...compare.a.map((t) => t.id)]);
  const ownNames = new Set(compare.a.map((t) => lower(t.name)));
  const seen = new Set<string>();
  const out: SideTag[] = [];
  for (const t of compare.b) {
    const name = lower(t.name);
    if (isNamespaceRoot(t) || !GAP_NAMESPACES.includes(t.namespace) || ownIds.has(t.id) || ownNames.has(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(t);
  }
  return out
    .map((t, i) => ({ t, i, ns: GAP_NAMESPACES.indexOf(t.namespace) }))
    .sort((a, b) => b.t.count - a.t.count || a.ns - b.ns || a.i - b.i)
    .map((x) => x.t);
}

// The gap is the partners' side of compare minus the venue's side.
export function partnerGaps(compare: CompareRead, partners: LovedPlace[], ctx: ReadContext, ref: number): Gap[] {
  const n = partners.length;
  return partnerCandidates(compare, ctx)
    .slice(0, MAX_GAPS)
    .map((t, i): Gap => {
      const carriers = partners.filter((p) => p.tags.includes(t.id)).map((p) => p.name);
      const count = Math.min(n, Math.max(t.count, carriers.length));
      const which = carriers.length ? `Tagged ${t.name}: ${listWords(carriers)}` : `${t.name} is on ${count} of the ${n} nearby places Qloo compared with ${ctx.name}`;
      return {
        tag: { id: t.id, name: t.name, namespace: t.namespace, rank: i + 1 },
        note: `${count} of the ${n} places nearby that ${ctx.name}'s audience also loves ${count === 1 ? "is" : "are"} tagged ${t.name}; ${ctx.name} is not`,
        because: [
          { kind: "compare", text: which, provenance: ref },
          { kind: "compare", text: `${ctx.name}'s own Qloo tags do not include ${t.name}`, provenance: ref },
        ],
      };
    });
}
