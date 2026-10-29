import type { Baseline, BaselineName, NightPlan, StreetRead, Venue, VerifyStatus } from "../../shared/contract.ts";
import { TYPE_PLURAL, capFirst, ordinal, possessive } from "../../shared/words.ts";
import type { Generate } from "../copy/write.ts";
import type { Qloo } from "../qloo/client.ts";
import { sameId } from "../qloo/values.ts";
import { PLAIN_SYSTEM, baselineAsk, extractNames } from "./extract.ts";
import { describeDistance } from "../street/geo.ts";
import { NEARBY_M, SEARCH_MILES, verifyArtist, verifyOther, verifyPlace, type Checked } from "./verify.ts";

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

// Hard failures first: closed, not in Qloo, then real but not tied to this crowd. The venue itself goes last.
const FAILURE_ORDER = (n: BaselineName, venueId: string, id?: string): number => {
  if (id && sameId(id, venueId)) return 5;
  if (n.closed) return 0;
  if (n.status === "not_found") return 1;
  if (n.tied === false) return 2;
  if (n.status === "found_far") return 3;
  return 4;
};

export function hardFailuresFirst(checked: Array<{ name: BaselineName; id?: string }>, venueId: string): BaselineName[] {
  return checked
    .map((c, i) => ({ c, i, o: FAILURE_ORDER(c.name, venueId, c.id) }))
    .sort((a, b) => a.o - b.o || a.i - b.i)
    .map((x) => x.c.name);
}

// Full House's own picks come from Qloo, so checking them against Qloo would prove nothing. They are listed from the read as they are.
function ownNames(read: StreetRead, venue: Venue, plan: NightPlan | null): BaselineName[] {
  const places = read.match ? [read.match.partner, ...read.match.runnersUp] : (plan?.partners ?? []).slice(0, 3);
  const n = read.lovedPlaces.length;
  return places.map((p) => ({
    name: p.name,
    kind: "place",
    status: "found_nearby",
    note: `${capFirst(describeDistance(p.distanceM))} from ${venue.entity.name}, in the street read`,
    tied: true,
    tieNote: `${ordinal(p.rank)} of ${n} places nearby people who like ${venue.entity.name} love`,
  }));
}

// "@cf/meta/llama-3.3-70b-instruct-fp8-fast" reads as "Llama 3.3 70B".
export function modelLabel(id: string): string {
  const last = id.split("/").pop() ?? id;
  const name = last
    .split("-")
    .filter((w) => !/^(instruct|chat|fast|fp8|fp16|awq|int8|it|v\d+)$/i.test(w))
    .map((w) => (/^\d+(\.\d+)?b$/i.test(w) ? w.toUpperCase() : capFirst(w)))
    .join(" ");
  return `${name || id}, an open model far smaller than the big chatbots`;
}

function methodText(model: string, extraction: "model" | "pattern", readAt: string): string {
  const how = extraction === "model" ? "pulled the names from its answer with a second model call" : "pulled capitalised names from its answer because the extraction call failed";
  return [
    `We asked ${modelLabel(model)} (${model}) the question an owner would type into a chatbot, with no Qloo data, and ${how}. The name it gave the night itself is left out, because it is not a claim about the world.`,
    `Each place was looked up with Qloo's /search within ${SEARCH_MILES} miles of the venue: found nearby means an open place with a matching name within ${NEARBY_M / 1000} km, found far means a match further away, not found means no match came back or Qloo lists the place as permanently closed.`,
    "Artists were looked up in Qloo's artist catalog, then in the whole catalog if that missed, and other names in the whole catalog.",
    "Every name found was then looked for in the street read: among the places nearby Qloo ties to the venue's audience, or among the picks it returned for that audience. That tie is what a plain model cannot know.",
    "Full House's own places are not checked against Qloo, because they come from Qloo and the check would prove nothing. They are listed as the street read has them.",
    "Not found in Qloo's catalog is not proof that a place does not exist. It means Qloo's graph does not know it, so Full House could not have grounded a pick in it.",
    `The street read used is from ${readAt.slice(0, 10)}.`,
  ].join(" ");
}

export async function runBaseline(q: Qloo, venue: Venue, read: StreetRead, plan: NightPlan | null, generate: Generate, model: string): Promise<Baseline> {
  const ask = baselineAsk(venue);
  const plainText = (await generate(PLAIN_SYSTEM, ask)).trim();
  const extracted = await extractNames(plainText, generate, venue);

  const plain: Checked[] = [];
  for (const n of extracted.places) plain.push(await verifyPlace(q, n, venue));
  for (const n of extracted.artists) plain.push(await verifyArtist(q, n, venue));
  for (const n of extracted.other) plain.push(await verifyOther(q, n, venue));
  const tied = plain.map((c) => ({ name: audienceTie(c, read, venue), ...(c.id ? { id: c.id } : {}) }));

  return {
    at: (q.now?.() ?? new Date()).toISOString(),
    ask,
    model,
    modelLabel: modelLabel(model),
    plainText,
    plainNames: hardFailuresFirst(tied, venue.entity.id),
    fullHouseNames: ownNames(read, venue, plan),
    method: methodText(model, extracted.method, read.at),
  };
}
