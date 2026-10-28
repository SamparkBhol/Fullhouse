import type { Venue } from "../../shared/contract.ts";
import { weekdayName } from "../../shared/words.ts";
import { findNames, normalizeName } from "../copy/claims.ts";
import { extractJson } from "../copy/json.ts";
import type { Generate } from "../copy/write.ts";
import { sameName } from "./names.ts";

const MAX_PLACES = 4;
const MAX_ARTISTS = 2;
const MAX_OTHER = 2;

export const PLAIN_SYSTEM = "You are a helpful assistant.";

export const EXTRACT_SYSTEM =
  "You pull proper names out of a text. Return one JSON object and nothing else, shaped " +
  '{"places": [], "artists": [], "other": [], "events": []}. places are businesses or venues, artists are musicians or bands, ' +
  "other are any other named works or people (films, books, shows, podcasts, games, authors). " +
  "events holds the name or title the text gives to the suggested night itself, which is not a claim about the world. " +
  "Copy each name exactly as written. Leave out generic phrases that are not names.";

export interface Extracted {
  places: string[];
  artists: string[];
  other: string[];
  method: "model" | "pattern";
}

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

// The model's own name for the night, such as "Thursday Night Lit", is not a claim Qloo could check.
function isNightTitle(name: string, events: string[], venue: Venue): boolean {
  const day = weekdayName(venue.quietSlot.weekday).toLowerCase();
  return events.some((e) => sameName(e, name)) || normalizeName(name).split(" ").includes(day);
}

export async function extractNames(text: string, generate: Generate, venue: Venue): Promise<Extracted> {
  const raw = await generate(EXTRACT_SYSTEM, text.slice(0, 6000)).catch(() => "");
  const obj = extractJson(raw);
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    const o = obj as Record<string, unknown>;
    const events = cleanList(o.events, 4);
    const other = cleanList(o.other, MAX_OTHER + 2).filter((n) => !isNightTitle(n, events, venue)).slice(0, MAX_OTHER);
    return { places: cleanList(o.places, MAX_PLACES), artists: cleanList(o.artists, MAX_ARTISTS), other, method: "model" };
  }
  const found = findNames(text).filter((f) => f.multi).map((f) => f.text);
  const other = cleanList(found, MAX_PLACES + MAX_OTHER + 2).filter((n) => !isNightTitle(n, [], venue)).slice(0, MAX_PLACES + MAX_OTHER);
  return { places: [], artists: [], other, method: "pattern" };
}
