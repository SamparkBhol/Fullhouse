import { readFileSync } from "node:fs";
import type { Venue } from "../../src/shared/contract.ts";

export const VENUE_ID = "0B5E1C2A-7D3F-4E8A-9B61-2C4D5E6F7A01";
export const CENTER = { lat: 40.721, lng: -73.958 };
export const NOW = new Date("2026-10-25T15:00:00.000Z");

export const VENUE: Venue = {
  id: "venue-1",
  entity: {
    id: VENUE_ID,
    name: "Cafe Lumen",
    type: "place",
    address: "12 Grand St Brooklyn, NY 11211",
    lat: CENTER.lat,
    lng: CENTER.lng,
    tags: ["urn:tag:genre:place:cafe", "urn:tag:ambience:qloo:cozy"],
  },
  city: "Brooklyn",
  tz: "America/New_York",
  quietSlot: { weekday: 4, start: "19:00", durationMin: 180 },
  capacity: 40,
  createdAt: "2026-10-20T10:00:00.000Z",
};

export function fixture(name: string): any {
  return JSON.parse(readFileSync(new URL(`./qloo/${name}.json`, import.meta.url), "utf8"));
}

export type Reply = { status: number; body: unknown; headers?: Record<string, string> } | "throw" | "hang";

export interface RecordedCall {
  url: URL;
  headers: Record<string, string>;
}

export type Route = (url: URL) => Reply | undefined;

const ok = (name: string): Reply => ({ status: 200, body: fixture(name) });

function insightsRoute(p: URLSearchParams): Reply | undefined {
  const type = p.get("filter.type");
  if (type === "urn:tag") return ok(p.get("signal.interests.entities") ? "insights_venue_tags" : "insights_street_tags");
  if (type === "urn:heatmap") return ok(p.get("signal.interests.entities") ? "heatmap_venue" : "heatmap_street");
  if (type === "urn:demographics") return ok("demographics");
  if (type === "urn:entity:place") return ok("insights_place");
  const cross = /^urn:entity:(artist|book|movie|tv_show|podcast)$/.exec(type ?? "");
  if (cross) return ok(`insights_${cross[1]}`);
  return { status: 400, body: { errors: [{ message: `The value ${type} is not supported for filter.type`, path: "filter.type", subtype: type }] } };
}

export function streetRoute(url: URL): Reply | undefined {
  if (url.pathname === "/search") return ok("search_place");
  if (url.pathname === "/v2/analysis/compare") return ok("compare");
  if (url.pathname === "/v2/insights") return insightsRoute(url.searchParams);
  return undefined;
}

export function fakeFetch(routes: Route[]): { fetch: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const f = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const headers: Record<string, string> = {};
    const h = init?.headers;
    if (h instanceof Headers) h.forEach((v, k) => (headers[k.toLowerCase()] = v));
    else if (h && typeof h === "object" && !Array.isArray(h)) {
      for (const [k, v] of Object.entries(h as Record<string, string>)) headers[k.toLowerCase()] = v;
    }
    calls.push({ url, headers });
    let reply: Reply | undefined;
    for (const r of routes) {
      reply = r(url);
      if (reply !== undefined) break;
    }
    if (reply === "throw") throw new TypeError("fetch failed");
    if (reply === "hang") {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }
    if (!reply) return new Response(JSON.stringify({ error: { code: 404, message: "No path matching request parameters", reason: "Not Found" } }), { status: 404 });
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json", ...(reply.headers ?? {}) } });
  };
  return { fetch: f as typeof fetch, calls };
}
