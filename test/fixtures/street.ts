import type { Venue } from "../../src/shared/contract.ts";

export const CENTER = { lat: 40.721, lng: -73.958 };

export const VENUE: Venue = {
  id: "venue-1",
  entity: {
    id: "VENUE-0000-0000-0000-000000000001",
    name: "Cafe Lumen",
    type: "place",
    address: "12 Grand St, Brooklyn, NY 11211",
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

const tag = (id: string, name: string, affinity: number) => ({
  tag_id: id,
  name,
  types: ["urn:tag"],
  subtype: id.split(":").slice(0, 4).join(":"),
  tag_value: id,
  query: { affinity },
});

const placeTag = (id: string, name: string) => ({ id, name, type: id.split(":").slice(0, 4).join(":") });

export const STREET_TAGS = {
  success: true,
  results: {
    tags: [
      tag("urn:tag:genre:music:jazz", "Jazz", 0.95),
      tag("urn:tag:ambience:qloo:intimate", "Intimate", 0.93),
      tag("urn:tag:genre:media:documentary", "Documentary", 0.91),
      tag("urn:tag:menu_highlight:qloo:natural_wine", "Natural Wine", 0.9),
      tag("urn:tag:cuisine:qloo:japanese", "Japanese", 0.88),
      tag("urn:tag:genre:music:soul", "Soul", 0.86),
      tag("urn:tag:ambience:qloo:cozy", "Cozy", 0.85),
      tag("urn:tag:genre:media:science_fiction", "Science Fiction", 0.8),
    ],
  },
  duration: 20,
};

export const VENUE_TAGS = {
  success: true,
  results: {
    tags: [
      tag("urn:tag:ambience:qloo:cozy", "Cozy", 0.97),
      tag("urn:tag:ambience:qloo:intimate", "Intimate", 0.9),
      tag("urn:tag:genre:media:documentary", "Documentary", 0.8),
    ],
  },
};

const place = (id: string, name: string, lat: number | null, lng: number | null, affinity: number, tags: Array<[string, string]>, extra: Record<string, unknown> = {}) => ({
  name,
  entity_id: id,
  type: "urn:entity",
  subtype: "urn:entity:place",
  popularity: 0.9,
  properties: {
    address: `${name} address, Brooklyn`,
    ...(lat !== null && lng !== null ? { lat, lon: lng } : {}),
    akas: [{ value: `${name} aka`, languages: ["fr"] }],
  },
  tags: tags.map(([i, n]) => placeTag(i, n)),
  query: { affinity, distance: 100, ...extra },
});

export const LOVED = {
  success: true,
  results: {
    entities: [
      place(VENUE.entity.id, "Cafe Lumen", CENTER.lat, CENTER.lng, 0.99, [["urn:tag:genre:place:cafe", "Cafe"]]),
      place(
        "PLACE-1",
        "Blue Hour Wine Bar",
        40.7225,
        -73.957,
        0.96,
        [
          ["urn:tag:genre:place:wine_bar", "Wine Bar"],
          ["urn:tag:menu_highlight:qloo:natural_wine", "Natural Wine"],
          ["urn:tag:ambience:qloo:intimate", "Intimate"],
        ],
        { explainability: { "signal.location": 0.9 } },
      ),
      place("PLACE-2", "Kettle Books", 40.719, -73.96, 0.92, [
        ["urn:tag:genre:place:bookstore", "Bookstore"],
        ["urn:tag:ambience:qloo:cozy", "Cozy"],
      ]),
      place("PLACE-3", "Sora Ramen", 40.724, -73.953, 0.9, [
        ["urn:tag:genre:place:restaurant:japanese", "Japanese"],
        ["urn:tag:cuisine:qloo:japanese", "Japanese"],
        ["urn:tag:menu_highlight:qloo:natural_wine", "Natural Wine"],
      ]),
      place("PLACE-4", "Daybreak Cafe", 40.72, -73.959, 0.89, [["urn:tag:genre:place:cafe", "Cafe"]]),
      place("PLACE-5", "Far Away Diner", 40.75, -73.99, 0.85, [["urn:tag:genre:place:diner", "Diner"]]),
      place("PLACE-6", "No Coords Place", null, null, 0.8, [["urn:tag:genre:place:bar", "Bar"]]),
    ],
  },
};

const cell = (geohash: string, lat: number, lng: number, affinity_rank: number | null, popularity: number) => ({
  location: { latitude: lat, longitude: lng, geohash },
  query: affinity_rank === null ? { affinity: 0, popularity: 0 } : { affinity: 0.9, affinity_rank, popularity },
});

export const HEAT_STREET = {
  success: true,
  results: {
    heatmap: [
      cell("dr5rsq1", 40.7215, -73.9575, 0.97, 0.8),
      cell("dr5rsq2", 40.725, -73.95, 0.9, 0.6),
      cell("dr5rsq3", 40.715, -73.965, 0.5, 0.3),
      cell("dr5rsq4", 40.71, -73.97, null, 0),
    ],
  },
};

export const HEAT_VENUE = {
  success: true,
  results: { heatmap: [cell("dr5rsq1", 40.7215, -73.9575, 0.88, 0.7), cell("dr5rsq5", 40.73, -73.94, 0.4, 0.2)] },
};

const ent = (id: string, name: string, subtype: string, affinity: number, tags: Array<[string, string]>, extra: Record<string, unknown> = {}) => ({
  entity_id: id,
  name,
  type: "urn:entity",
  subtype,
  popularity: 0.95,
  properties: { short_descriptions: [{ value: "x", languages: ["en"] }], image: { url: `https://images.qloo.com/i/${id}.jpg` } },
  tags: tags.map(([i, n]) => placeTag(i, n)),
  query: { affinity, ...extra },
});

export const TYPE_RESULTS: Record<string, unknown> = {
  "urn:entity:artist": {
    success: true,
    results: {
      entities: [
        ent("ART-1", "Alice Coltrane", "urn:entity:artist", 0.97, [["urn:tag:genre:music:jazz", "Jazz"]], { explainability: { "signal.location": 0.8 } }),
        ent("ART-2", "Sade", "urn:entity:artist", 0.94, [["urn:tag:genre:music:soul", "Soul"]]),
        ent("ART-3", "Khruangbin", "urn:entity:artist", 0.9, [["urn:tag:genre:music:psychedelic", "Psychedelic"]]),
      ],
    },
  },
  "urn:entity:book": {
    success: true,
    results: { entities: [ent("BOOK-1", "The Overstory", "urn:entity:book", 0.93, [["urn:tag:genre:media:literary_fiction", "Literary Fiction"]])] },
  },
  "urn:entity:movie": {
    success: true,
    results: {
      entities: [
        ent("MOV-1", "Paterson", "urn:entity:movie", 0.95, [["urn:tag:genre:media:drama", "Drama"]]),
        ent("MOV-2", "Arrival", "urn:entity:movie", 0.92, [["urn:tag:genre:media:science_fiction", "Science Fiction"]]),
      ],
    },
  },
  "urn:entity:tv_show": { success: true, results: { entities: [] } },
  "urn:entity:podcast": {
    success: true,
    results: { entities: [ent("POD-1", "Song Exploder", "urn:entity:podcast", 0.9, [["urn:tag:genre:media:music", "Music"]])] },
  },
  "urn:entity:video_game": {
    success: true,
    results: { entities: [ent("GAME-1", "Stardew Valley", "urn:entity:videogame", 0.91, [["urn:tag:genre:media:simulation", "Simulation"]])] },
  },
};

export const COMPARE = {
  duration: 0.4,
  results: {
    tags: [
      { tag_id: "urn:tag:ambience:qloo:intimate", name: "Intimate", type: "urn:tag", subtype: "urn:tag:ambience:qloo", popularity: 0.9, query: { score: 0.81 } },
      { tag_id: "urn:tag:ambience:qloo:cozy", name: "Cozy", type: "urn:tag", subtype: "urn:tag:ambience:qloo", popularity: 0.8, query: { score: 0.62 } },
    ],
  },
};

export const DEMOGRAPHICS = {
  success: true,
  results: {
    demographics: [
      { entity_id: "urn:tag:genre:music:jazz", query: { age: { "24_and_younger": -0.1, "25_to_29": 0.3, "30_to_34": 0.25, "35_to_44": 0.02, "45_to_54": -0.2, "55_and_older": -0.3 }, gender: { male: 0.02, female: -0.02 } } },
      { entity_id: "urn:tag:ambience:qloo:intimate", query: { age: { "24_and_younger": 0, "25_to_29": 0.2, "30_to_34": 0.35, "35_to_44": 0.1, "45_to_54": -0.2, "55_and_older": -0.4 }, gender: { male: -0.12, female: 0.12 } } },
    ],
  },
};

export const TRENDING: Record<string, unknown> = {
  "ART-1": {
    success: true,
    results: {
      trending: [
        { date: "2026-10-17", population_percentile: 97.1, population_rank: 12, population_rank_velocity: 4, velocity_fold_change: 1.3, population_percent_delta: 1.2 },
        { date: "2026-10-10", population_percentile: 95.0, population_rank: 20, population_rank_velocity: 3, velocity_fold_change: 1.1, population_percent_delta: 0.5 },
        { date: "2026-09-05", population_percentile: 92.0, population_rank: 30, population_rank_velocity: 0, velocity_fold_change: 1.0, population_percent_delta: 0.0 },
      ],
    },
  },
  "BOOK-1": {
    success: true,
    results: {
      trending: [
        { date: "2026-10-17", population_percentile: 80.0, population_rank: 50 },
        { date: "2026-09-05", population_percentile: 85.0, population_rank: 40 },
      ],
    },
  },
  "MOV-2": {
    success: true,
    results: { entities: [{ name: "Arrival", entity_id: "MOV-2", type: "urn:entity:movie", properties: { trend_rank: 3 } }] },
  },
};

export const VENUE_ENTITY = {
  success: true,
  results: [
    {
      name: "Cafe Lumen",
      entity_id: VENUE.entity.id,
      types: ["urn:entity:place"],
      properties: { address: "12 Grand St, Brooklyn, NY 11211", lat: CENTER.lat, lon: CENTER.lng },
      tags: [placeTag("urn:tag:genre:place:cafe", "Cafe"), placeTag("urn:tag:ambience:qloo:cozy", "Cozy")],
    },
  ],
};

export type Reply = { status: number; body: unknown; headers?: Record<string, string> } | "throw" | "hang";

export interface RecordedCall {
  url: URL;
  headers: Record<string, string>;
}

export type Route = (url: URL) => Reply | undefined;

export function streetRoute(url: URL): Reply | undefined {
  const p = url.searchParams;
  const ok = (body: unknown): Reply => ({ status: 200, body });
  if (url.pathname === "/entities") {
    return p.get("entity_ids") === VENUE.entity.id ? ok(VENUE_ENTITY) : ok({ success: true, results: [] });
  }
  if (url.pathname === "/v2/analysis/compare") return ok(COMPARE);
  if (url.pathname === "/v2/trending") {
    const id = p.get("signal.interests.entities") ?? "";
    return ok(TRENDING[id] ?? { success: true, results: { trending: [] } });
  }
  if (url.pathname !== "/v2/insights") return undefined;
  const type = p.get("filter.type");
  if (type === "urn:tag") {
    if (p.get("signal.interests.entities") === VENUE.entity.id) return ok(VENUE_TAGS);
    if (p.get("signal.location")) return ok(STREET_TAGS);
  }
  if (type === "urn:entity:place") return ok(LOVED);
  if (type === "urn:heatmap") return ok(p.get("signal.interests.entities") ? HEAT_VENUE : HEAT_STREET);
  if (type === "urn:demographics") return ok(DEMOGRAPHICS);
  if (type === "urn:entity:videogame") {
    return { status: 403, body: { code: 403, reason: "Forbidden", message: "You do not have permission to access urn:entity:videogame" } };
  }
  if (type && TYPE_RESULTS[type]) return ok(TYPE_RESULTS[type]);
  return undefined;
}

export function fakeFetch(routes: Route[]): { fetch: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const f = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const headers: Record<string, string> = {};
    const h = init?.headers;
    if (h && typeof h === "object" && !Array.isArray(h) && !(h instanceof Headers)) {
      for (const [k, v] of Object.entries(h as Record<string, string>)) headers[k.toLowerCase()] = v;
    } else if (h instanceof Headers) {
      h.forEach((v, k) => (headers[k.toLowerCase()] = v));
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
    if (!reply) return new Response(JSON.stringify({ code: 404, reason: "Not Found", message: "no route" }), { status: 404 });
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json", ...(reply.headers ?? {}) } });
  };
  return { fetch: f as typeof fetch, calls };
}

export const NOW = new Date("2026-10-25T15:00:00.000Z");
