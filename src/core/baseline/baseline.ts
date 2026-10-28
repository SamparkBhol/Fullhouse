import type { Baseline, BaselineName, NightPlan, StreetRead, Venue, VerifyStatus } from "../../shared/contract.ts";
import { TYPE_PLURAL, ordinal, possessive } from "../../shared/words.ts";
import type { Generate } from "../copy/write.ts";
import type { Qloo } from "../qloo/client.ts";
import { sameId } from "../qloo/values.ts";
import { PLAIN_SYSTEM, baselineAsk, extractNames } from "./extract.ts";
import { NEARBY_M, SEARCH_MILES, verifyArtist, verifyById, verifyOther, verifyPlace, type Checked, type OwnName } from "./verify.ts";

export function summarise(names: BaselineName[]): Record<VerifyStatus, number> {
  const out: Record<VerifyStatus, number> = { found_nearby: 0, found_far: 0, not_found: 0 };
  for (const n of names) out[n.status]++;
  return out;
}

// Existing in Qloo is the easy part. What only Qloo knows is whether people who like this venue also love the place or work.
export function audienceTie(c: Checked, read: StreetRead, venue: Venue): BaselineName {
  const name = { ...c.name };
  const id = c.id;
  if (!id || name.status === "not_found" || sameId(id, venue.entity.id)) return name;
  const audience = `people who like ${venue.entity.name}`;
  if (name.kind === "place") {
    const n = read.lovedPlaces.length;
    const hit = read.lovedPlaces.find((p) => sameId(p.id, id));
    name.tied = Boolean(hit);
    name.tieNote = hit ? `${ordinal(hit.rank)} of ${n} places nearby ${audience} love` : `Not among the ${n} places nearby Qloo ties to ${possessive(venue.entity.name)} audience`;
    return name;
  }
  const pick = read.rising.find((r) => sameId(r.id, id) && r.venueSignal !== false);
  name.tied = Boolean(pick);
  name.tieNote = pick ? `${ordinal(pick.rank)} among the ${TYPE_PLURAL[pick.type]} Qloo returned for ${audience}` : `Not among the picks Qloo returned for ${audience}`;
  return name;
}

function ownNames(plan: NightPlan): OwnName[] {
  const own: OwnName[] = [];
  if (plan.feature) own.push({ id: plan.feature.id, name: plan.feature.name, kind: plan.feature.type === "artist" ? "artist" : "other" });
  for (const p of plan.partners.slice(0, 3)) own.push({ id: p.id, name: p.name, kind: "place", distanceM: p.distanceM });
  return own;
}

function methodText(model: string, extraction: "model" | "pattern", readAt: string): string {
  const how = extraction === "model" ? "pulled the names from its answer with a second model call" : "pulled capitalised names from its answer because the extraction call failed";
  return [
    `We asked ${model} the question an owner would type into a chatbot, with no Qloo data, and ${how}. The name it gave the night itself is left out, because it is not a claim about the world.`,
    `Each place was looked up with Qloo's /search within ${SEARCH_MILES} miles of the venue: found nearby means an open place with a matching name within ${NEARBY_M / 1000} km, found far means a match further away, not found means no match came back or Qloo lists the place as permanently closed.`,
    "Artists were looked up in Qloo's artist catalog, then in the whole catalog if that missed, and other names in the whole catalog.",
    "Full House's own feature and partners were checked by their Qloo ids in one call.",
    "Every name found was then looked for in the street read: among the places nearby Qloo ties to the venue's audience, or among the picks it returned for that audience. That tie is what a plain model cannot know.",
    "Not found in Qloo's catalog is not proof that a place does not exist. It means Qloo's graph does not know it, so Full House could not have grounded a pick in it.",
    `The street read used for Full House's plan is from ${readAt.slice(0, 10)}.`,
  ].join(" ");
}

export async function runBaseline(q: Qloo, venue: Venue, read: StreetRead, plan: NightPlan, generate: Generate, model: string): Promise<Baseline> {
  const ask = baselineAsk(venue);
  const plainText = (await generate(PLAIN_SYSTEM, ask)).trim();
  const extracted = await extractNames(plainText, generate, venue);

  const plain: Checked[] = [];
  for (const n of extracted.places) plain.push(await verifyPlace(q, n, venue));
  for (const n of extracted.artists) plain.push(await verifyArtist(q, n, venue));
  for (const n of extracted.other) plain.push(await verifyOther(q, n, venue));
  const own = await verifyById(q, ownNames(plan));

  return {
    at: (q.now?.() ?? new Date()).toISOString(),
    ask,
    model,
    plainText,
    plainNames: plain.map((c) => audienceTie(c, read, venue)),
    fullHouseNames: own.map((c) => audienceTie(c, read, venue)),
    method: methodText(model, extracted.method, read.at),
  };
}
