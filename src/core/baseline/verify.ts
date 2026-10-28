import type { BaselineName, Venue } from "../../shared/contract.ts";
import { haversineM } from "../../shared/geo.ts";
import type { Qloo } from "../qloo/client.ts";
import { QlooError } from "../qloo/errors.ts";
import { parseEntities, type QEntity } from "../qloo/entities.ts";
import { searchNear } from "../qloo/location.ts";
import { TYPE_URN } from "../qloo/urns.ts";
import { sameId } from "../qloo/values.ts";
import { describeDistance } from "../street/geo.ts";
import { sameName } from "./names.ts";

export const NEARBY_M = 2000;
export const SEARCH_MILES = 10;

// A checked name keeps the Qloo id it matched, so the proof can ask whether Qloo ties it to the venue's audience.
export interface Checked {
  name: BaselineName;
  id?: string;
}

async function lookup(q: Qloo, call: string, path: string, params: Record<string, string>): Promise<QEntity[] | QlooError> {
  try {
    const { body } = await q.get(call, path, params);
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

function failed(name: string, kind: BaselineName["kind"], err: QlooError): Checked {
  return { name: { name, kind, status: "not_found", note: `Not checked: the Qloo search failed (${err.kind})` } };
}

function addressOf(e: QEntity): string {
  return e.address ? `, ${e.address}` : "";
}

export async function verifyPlace(q: Qloo, name: string, venue: Venue): Promise<Checked> {
  const center = { lat: venue.entity.lat, lng: venue.entity.lng };
  const hits = await lookup(q, "verify_place", "/search", { query: name, types: TYPE_URN.place, take: "5", ...searchNear(center.lat, center.lng, SEARCH_MILES) });
  if (hits instanceof QlooError) return failed(name, "place", hits);
  const matches = hits.filter((h) => sameName(h.name, name));
  if (!matches.length) return { name: { name, kind: "place", status: "not_found", note: `No place with this name in Qloo's catalog within ${SEARCH_MILES} miles` } };
  const open = matches.filter((m) => !m.closed);
  // A place Qloo lists as permanently closed cannot ground a partner, so it counts as not found.
  if (!open.length) {
    const shut = matches[0] as QEntity;
    return { name: { name, kind: "place", status: "not_found", closed: true, note: `In Qloo as permanently closed: ${shut.name}${addressOf(shut)}` }, id: shut.id };
  }
  const located = open
    .filter((m) => m.lat !== null && m.lng !== null)
    .map((m) => ({ m, d: haversineM(center, { lat: m.lat as number, lng: m.lng as number }) }))
    .sort((a, b) => a.d - b.d);
  const best = located[0];
  if (best && sameId(best.m.id, venue.entity.id)) {
    return { name: { name, kind: "place", status: "found_nearby", note: `This is ${venue.entity.name} itself, so it cannot be a partner` }, id: best.m.id };
  }
  if (best && best.d <= NEARBY_M) {
    return { name: { name, kind: "place", status: "found_nearby", note: `${best.m.name}${addressOf(best.m)}, ${describeDistance(best.d)} away` }, id: best.m.id };
  }
  if (best) return { name: { name, kind: "place", status: "found_far", note: `${best.m.name} is ${describeDistance(best.d)} away` }, id: best.m.id };
  const first = open[0] as QEntity;
  return { name: { name, kind: "place", status: "found_far", note: `${first.name} is in Qloo's catalog, but without a location to measure` }, id: first.id };
}

function inCatalog(name: string, kind: BaselineName["kind"], match: QEntity): Checked {
  const what = match.typeName ? ` (${match.typeName})` : "";
  return { name: { name, kind, status: "found_nearby", note: `In Qloo's catalog as ${match.name}${what}; distance does not apply` }, id: match.id };
}

export async function verifyOther(q: Qloo, name: string, venue: Venue, kind: BaselineName["kind"] = "other"): Promise<Checked> {
  const hits = await lookup(q, "verify_other", "/search", { query: name, take: "5" });
  if (hits instanceof QlooError) return failed(name, kind, hits);
  const match = hits.find((h) => sameName(h.name, name));
  if (!match) return { name: { name, kind, status: "not_found", note: "Nothing with this name in Qloo's catalog" } };
  if (match.type === "place" && match.lat !== null && match.lng !== null) {
    const d = haversineM({ lat: venue.entity.lat, lng: venue.entity.lng }, { lat: match.lat, lng: match.lng });
    return { name: { name, kind, status: d <= NEARBY_M ? "found_nearby" : "found_far", note: `A place, ${describeDistance(d)} away` }, id: match.id };
  }
  return inCatalog(name, kind, match);
}

// A featured act the model calls an artist is often an author or a film, so a miss is searched again across the catalog.
export async function verifyArtist(q: Qloo, name: string, venue: Venue): Promise<Checked> {
  const hits = await lookup(q, "verify_artist", "/search", { query: name, types: TYPE_URN.artist, take: "5" });
  if (hits instanceof QlooError) return failed(name, "artist", hits);
  const match = hits.find((h) => sameName(h.name, name));
  if (match) return { name: { name, kind: "artist", status: "found_nearby", note: `In Qloo's artist catalog as ${match.name}; distance does not apply to artists` }, id: match.id };
  return verifyOther(q, name, venue, "artist");
}

export interface OwnName {
  id: string;
  name: string;
  kind: BaselineName["kind"];
  distanceM?: number;
}

// Full House's own picks already carry Qloo ids, so one call by id checks them all without a fuzzy search.
export async function verifyById(q: Qloo, own: OwnName[]): Promise<Checked[]> {
  if (!own.length) return [];
  const hits = await lookup(q, "verify_own", "/entities", { entity_ids: own.map((o) => o.id).join(",") });
  return own.map((o) => {
    if (hits instanceof QlooError) return failed(o.name, o.kind, hits);
    const hit = hits.find((h) => sameId(h.id, o.id));
    if (!hit) return { name: { name: o.name, kind: o.kind, status: "not_found", note: "Qloo did not return this id" }, id: o.id };
    const where = o.distanceM !== undefined ? `, ${describeDistance(o.distanceM)} away` : "; distance does not apply";
    return { name: { name: o.name, kind: o.kind, status: "found_nearby", note: `Checked by Qloo id as ${hit.name}${where}` }, id: o.id };
  });
}
