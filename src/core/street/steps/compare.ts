import type { Gap, LovedPlace, StreetTag } from "../../../shared/contract.ts";
import { parseCompare, type CompareRead } from "../../qloo/compare.ts";
import type { QTag } from "../../qloo/tags.ts";
import { renumber, tagKeys, uniqueBy } from "../rank.ts";
import type { Runner } from "../runner.ts";
import type { Fingerprint } from "./fingerprint.ts";
import { isCatalogueTag, partnerGaps } from "./gaps.ts";
import type { ReadContext } from "./resolve.ts";

// With three places nearly every partner tag is carried once; five lets a gap be one the street shares.
export const PARTNERS_COMPARED = 5;
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

function asStreetTags(tags: QTag[]): StreetTag[] {
  return tags.filter((t) => !isCatalogueTag(t)).map((t) => ({ id: t.id, name: t.name, namespace: t.namespace, rank: 0 }));
}

// Compare's shared tags come first, then the venue's own side of compare. The street and audience overlap
// only fills in when compare could not run.
function sharedTags(read: CompareRead | null, street: Fingerprint | null, audience: Fingerprint | null): StreetTag[] {
  const audienceIds = new Set(audience?.tags.map((t) => t.id) ?? []);
  const tags = read ? [...asStreetTags(read.shared), ...asStreetTags(read.a)] : (street?.tags ?? []).filter((t) => audienceIds.has(t.id));
  return renumber(uniqueBy(tags, tagKeys).slice(0, MAX_SHARED));
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
  const shared = sharedTags(compared?.read ?? null, input.street, input.audience);
  const gaps = compared ? partnerGaps(compared.read, partners, ctx, compared.ref) : [];
  const limits: string[] = [];
  if (!partners.length) limits.push(`${ctx.name} was not compared with nearby places because none came back, so this read shows no gap.`);
  else if (compared && !gaps.length) {
    const by = partners.length > 1 ? "shared by two or more of the places" : "on the one place";
    limits.push(`No tag missing from ${ctx.name} is ${by} nearby that its audience loves, so this read shows no gap.`);
  }
  return { shared, gaps, limits };
}
