import type { Gap, LovedPlace, StreetTag } from "../../../shared/contract.ts";
import { parseCompare, type CompareRead } from "../../qloo/compare.ts";
import { isNamespaceRoot } from "../../qloo/tags.ts";
import { renumber, tagKeys, uniqueBy } from "../rank.ts";
import type { Runner } from "../runner.ts";
import type { Fingerprint } from "./fingerprint.ts";
import { MAX_GAPS, partnerGaps, tasteGaps } from "./gaps.ts";
import type { ReadContext } from "./resolve.ts";

export const PARTNERS_COMPARED = 3;
const MAX_SHARED = 10;

export interface CompareInput {
  partners: LovedPlace[];
  street: Fingerprint | null;
  audience: Fingerprint | null;
}

export interface CompareOutput {
  shared: StreetTag[];
  gaps: Gap[];
  limits: string[];
}

// Compare's shared tags at most venues are one or two generic ones such as Place, scored about 0.731.
function compareShared(read: CompareRead): StreetTag[] {
  return read.shared.filter((t) => !isNamespaceRoot(t)).map((t) => ({ id: t.id, name: t.name, namespace: t.namespace, rank: 0 }));
}

function tagOverlap(street: Fingerprint | null, audience: Fingerprint | null): StreetTag[] {
  if (!street || !audience) return [];
  const ids = new Set(audience.tags.map((t) => t.id));
  return street.tags.filter((t) => ids.has(t.id));
}

async function runCompare(run: Runner, ctx: ReadContext, partners: LovedPlace[]): Promise<{ read: CompareRead; ref: number } | null> {
  if (!partners.length) return null;
  const params = { "a.signal.interests.entities": ctx.entityId, "b.signal.interests.entities": partners.map((p) => p.id), take: "20" };
  const got = await run.call("compare", "/v2/analysis/compare", params, "Venue versus nearby places comparison");
  return got ? { read: parseCompare(got.body), ref: got.ref } : null;
}

export async function compareStep(run: Runner, ctx: ReadContext, input: CompareInput): Promise<CompareOutput> {
  const partners = input.partners.slice(0, PARTNERS_COMPARED);
  const compared = await runCompare(run, ctx, partners);
  const limits: string[] = [];
  const fromCompare = compared ? compareShared(compared.read) : [];
  if (compared && !fromCompare.length) limits.push(`${ctx.name} and the places nearby that its audience loves share no specific tags in Qloo's catalogue.`);
  if (!partners.length) limits.push(`${ctx.name} was not compared with nearby places because none came back.`);
  const shared = renumber(uniqueBy([...fromCompare, ...tagOverlap(input.street, input.audience)], tagKeys).slice(0, MAX_SHARED));

  const fromPartners = compared ? partnerGaps(compared.read, partners, ctx, compared.ref) : [];
  const fromTaste = input.street && input.audience ? tasteGaps(input.street, input.audience, ctx) : [];
  const gaps = uniqueBy([...fromPartners, ...fromTaste], (g) => tagKeys(g.tag)).slice(0, MAX_GAPS);
  if (!gaps.length) limits.push(`Qloo showed no gap between ${ctx.name} and its street in this read.`);
  return { shared, gaps, limits };
}
