import type { Baseline, BaselineName, NightPlan, StreetRead, Venue, VerifyStatus } from "../../shared/contract.ts";
import { findNames, normalizeName } from "../copy/claims.ts";
import { extractJson, type Generate } from "../copy/write.ts";
import { QlooError, type Qloo } from "../qloo/client.ts";
import { parseEntities, type QEntity } from "../qloo/parse.ts";
import { TYPE_URN, searchNear } from "../qloo/request.ts";
import { describeDistance, haversineM } from "../street/geo.ts";
import { weekdayName } from "../planner/time.ts";

export const NEARBY_M = 2000;
export const SEARCH_MILES = 10;
const MAX_PLACES = 4;
const MAX_ARTISTS = 2;
const MAX_OTHER = 2;

export const PLAIN_SYSTEM = "You are a helpful assistant.";

export const EXTRACT_SYSTEM =
  "You pull proper names out of a text. Return one JSON object and nothing else, shaped " +
  '{"places": [], "artists": [], "other": []}. places are businesses or venues, artists are musicians or bands, ' +
  "other are any other named works or people (films, books, shows, podcasts, games, authors). " +
  "Copy each name exactly as written. Leave out generic phrases that are not names.";

export function baselineAsk(venue: Venue): string {
  const where = venue.entity.address ? `${venue.entity.address}, ${venue.city}` : venue.city;
  const day = weekdayName(venue.quietSlot.weekday);
  return `I run ${venue.entity.name} at ${where}. ${day} evenings are quiet. Suggest one night I could run on a ${day}, one featured act for it, and three nearby businesses I could partner with.`;
}

function cleanList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    if (typeof x !== "string") continue;
    const s = x.replace(/\s+/g, " ").trim().slice(0, 120);
    const key = normalizeName(s);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export async function extractNames(text: string, generate: Generate): Promise<{ places: string[]; artists: string[]; other: string[]; method: "model" | "pattern" }> {
  try {
    const raw = await generate(EXTRACT_SYSTEM, text.slice(0, 6000));
    const obj = extractJson(raw);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const o = obj as Record<string, unknown>;
      return { places: cleanList(o.places, MAX_PLACES), artists: cleanList(o.artists, MAX_ARTISTS), other: cleanList(o.other, MAX_OTHER), method: "model" };
    }
  } catch {
    // Falls through to the pattern extraction below.
  }
  const found = findNames(text).filter((f) => f.multi).map((f) => f.text);
  return { places: [], artists: [], other: cleanList(found, MAX_PLACES + MAX_OTHER), method: "pattern" };
}

export function sameName(a: string, b: string): boolean {
  const x = normalizeName(a).replace(/^the /, "");
  const y = normalizeName(b).replace(/^the /, "");
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))) return true;
  const xs = new Set(x.split(" "));
  const ys = new Set(y.split(" "));
  const inter = [...xs].filter((w) => ys.has(w)).length;
  return inter / new Set([...xs, ...ys]).size >= 0.6;
}

async function lookup(q: Qloo, call: string, params: Record<string, string>): Promise<QEntity[] | QlooError> {
  try {
    const { body } = await q.get(call, "/search", params);
    return parseEntities(body);
  } catch (err) {
    if (err instanceof QlooError) {
      if (err.kind === "auth") throw err;
      if (err.kind === "not_found") return [];
      return err;
    }
    throw err;
  }
}

function failed(name: string, kind: BaselineName["kind"], err: QlooError): BaselineName {
  return { name, kind, status: "not_found", note: `Not checked: the Qloo search failed (${err.kind})` };
}

export async function verifyPlace(q: Qloo, name: string, venue: Venue): Promise<BaselineName> {
  const center = { lat: venue.entity.lat, lng: venue.entity.lng };
  const hits = await lookup(q, "verify_place", { query: name, types: TYPE_URN.place, take: "5", ...searchNear(center.lat, center.lng, SEARCH_MILES) });
  if (hits instanceof QlooError) return failed(name, "place", hits);
  const matches = hits.filter((h) => sameName(h.name, name));
  if (!matches.length) return { name, kind: "place", status: "not_found", note: `No place with this name in Qloo's catalog within ${SEARCH_MILES} miles` };
  const located = matches
    .filter((m) => m.lat !== null && m.lng !== null)
    .map((m) => ({ m, d: haversineM(center, { lat: m.lat as number, lng: m.lng as number }) }))
    .sort((a, b) => a.d - b.d);
  const best = located[0];
  if (best && best.d <= NEARBY_M) {
    return { name, kind: "place", status: "found_nearby", note: `${best.m.name}${best.m.address ? `, ${best.m.address}` : ""}, ${describeDistance(best.d)} away` };
  }
  if (best) return { name, kind: "place", status: "found_far", note: `${best.m.name} is ${describeDistance(best.d)} away` };
  return { name, kind: "place", status: "found_far", note: `${matches[0]?.name ?? name} is in Qloo's catalog, but without a location to measure` };
}

export async function verifyArtist(q: Qloo, name: string): Promise<BaselineName> {
  const hits = await lookup(q, "verify_artist", { query: name, types: TYPE_URN.artist, take: "5" });
  if (hits instanceof QlooError) return failed(name, "artist", hits);
  const match = hits.find((h) => sameName(h.name, name));
  if (!match) return { name, kind: "artist", status: "not_found", note: "No artist with this name in Qloo's catalog" };
  return { name, kind: "artist", status: "found_nearby", note: `In Qloo's artist catalog as ${match.name}; distance does not apply to artists` };
}

export async function verifyOther(q: Qloo, name: string, venue: Venue): Promise<BaselineName> {
  const hits = await lookup(q, "verify_other", { query: name, take: "5" });
  if (hits instanceof QlooError) return failed(name, "other", hits);
  const match = hits.find((h) => sameName(h.name, name));
  if (!match) return { name, kind: "other", status: "not_found", note: "Nothing with this name in Qloo's catalog" };
  if (match.type === "place" && match.lat !== null && match.lng !== null) {
    const d = haversineM({ lat: venue.entity.lat, lng: venue.entity.lng }, { lat: match.lat, lng: match.lng });
    return { name, kind: "other", status: d <= NEARBY_M ? "found_nearby" : "found_far", note: `A place, ${describeDistance(d)} away` };
  }
  return { name, kind: "other", status: "found_nearby", note: `In Qloo's catalog as ${match.name}${match.type ? ` (${match.type.replace("_", " ")})` : ""}; distance does not apply` };
}

export function summarise(names: BaselineName[]): Record<VerifyStatus, number> {
  const out: Record<VerifyStatus, number> = { found_nearby: 0, found_far: 0, not_found: 0 };
  for (const n of names) out[n.status]++;
  return out;
}

export async function runBaseline(q: Qloo, venue: Venue, read: StreetRead, plan: NightPlan, generate: Generate, model: string): Promise<Baseline> {
  const ask = baselineAsk(venue);
  const plainText = (await generate(PLAIN_SYSTEM, ask)).trim();
  const extracted = await extractNames(plainText, generate);

  const plainNames: BaselineName[] = [];
  for (const n of extracted.places) plainNames.push(await verifyPlace(q, n, venue));
  for (const n of extracted.artists) plainNames.push(await verifyArtist(q, n));
  for (const n of extracted.other) plainNames.push(await verifyOther(q, n, venue));

  const fullHouseNames: BaselineName[] = [];
  if (plan.feature) {
    fullHouseNames.push(plan.feature.type === "artist" ? await verifyArtist(q, plan.feature.name) : await verifyOther(q, plan.feature.name, venue));
  }
  for (const p of plan.partners.slice(0, 3)) fullHouseNames.push(await verifyPlace(q, p.name, venue));

  const extraction = extracted.method === "model" ? "pulled the names from its answer with a second model call" : "pulled capitalised names from its answer because the extraction call failed";
  const method = [
    `We asked ${model} the question an owner would type into a chatbot, with no Qloo data, and ${extraction}.`,
    `Each place was looked up with Qloo's /search within ${SEARCH_MILES} miles of the venue: found nearby means a place with a matching name within ${NEARBY_M / 1000} km, found far means a match further away, not found means no match came back.`,
    "Artists were looked up in Qloo's artist catalog, and other names in the whole catalog.",
    "Full House's own feature and partners were checked the same way.",
    "Not found in Qloo's catalog is not proof that a place does not exist or has closed. It means Qloo's graph does not know it, so Full House could not have grounded a pick in it.",
    `The street read used for Full House's plan is from ${read.at.slice(0, 10)}.`,
  ].join(" ");

  return {
    at: (q.now?.() ?? new Date()).toISOString(),
    ask,
    model,
    plainText,
    plainNames,
    fullHouseNames,
    method,
  };
}
