import { describe, expect, it } from "vitest";
import { AGGREGATE_LIMIT, FIRST_READ_LIMIT, NO_DEMOGRAPHICS, QlooError, RANK_LIMIT, createQloo, readStreet, type QlooCache } from "../../../src/core/index.ts";
import type { Because, StreetRead } from "../../../src/shared/contract.ts";
import { CENTER, NOW, VENUE, VENUE_ID, fakeFetch, streetRoute, type Route } from "../../fixtures/street.ts";

const KEY = "street-test-key";

function setup(routes: Route[] = [], extra: Record<string, unknown> = {}) {
  const f = fakeFetch([...routes, streetRoute]);
  const q = createQloo({ apiKey: KEY, fetch: f.fetch, now: () => NOW, sleep: async () => {}, ...extra });
  return { q, calls: f.calls };
}

function allBecause(read: StreetRead): Because[] {
  return [...read.lovedPlaces.flatMap((p) => p.because), ...read.rising.flatMap((r) => r.because), ...read.gaps.flatMap((g) => g.because)];
}

function expectValidProvenance(read: StreetRead) {
  for (const b of allBecause(read)) {
    expect(b.provenance, b.text).toBeGreaterThanOrEqual(0);
    expect(b.provenance, b.text).toBeLessThan(read.provenance.length);
  }
  for (const h of read.heat) expect(read.provenance[h.provenance]?.call).toMatch(/^heat_/);
  for (const i of read.match?.provenance ?? []) expect(["loved_places", "compare", "partner_tags"]).toContain(read.provenance[i]?.call);
}

const WINE_BAR = "A1B2C3D4-1111-4A2B-9C3D-0E1F2A3B4C11";

const paramsOf = (calls: Array<{ url: URL }>, match: (p: URLSearchParams) => boolean) => calls.find((c) => match(c.url.searchParams))?.url.searchParams;

describe("readStreet", () => {
  it("follows the call plan: twelve calls, the venue alone as the signal for its picks, no demographics, no trending", async () => {
    const { q, calls } = setup();
    const read = await readStreet(q, VENUE);

    expect(calls).toHaveLength(12);
    expect(read.provenance.map((p) => p.call)).toEqual([
      "street_tags",
      "venue_tags",
      "loved_places",
      "heat_venue",
      "compare",
      "partner_tags",
      "heat_street",
      "insights_artist",
      "insights_book",
      "insights_movie",
      "insights_tv_show",
      "insights_podcast",
    ]);
    for (const c of calls) {
      expect(c.headers["x-api-key"]).toBe(KEY);
      expect(c.url.href).not.toContain(KEY);
      expect(c.url.searchParams.has("bias.trends")).toBe(false);
      expect(c.url.pathname).not.toMatch(/trending|entities$/);
    }
    expect(JSON.stringify(read)).not.toContain(KEY);

    const artist = paramsOf(calls, (p) => p.get("filter.type") === "urn:entity:artist");
    expect(artist?.get("signal.interests.entities")).toBe(VENUE_ID);
    expect(artist?.get("signal.location")).toBe("POINT(-73.958 40.721)");
    expect(calls.some((c) => c.url.searchParams.get("filter.type") === "urn:demographics")).toBe(false);
    expect(paramsOf(calls, (p) => p.has("b.signal.interests.entities"))?.get("b.signal.interests.entities")).toBe(WINE_BAR);
    expect(read).toMatchObject({ venueId: "venue-1", at: NOW.toISOString(), center: CENTER, radiusM: 1200 });
    expectValidProvenance(read);
  });

  it("builds every section from the answers", async () => {
    const read = await readStreet(setup().q, VENUE);

    expect(read.streetTags.slice(0, 3).map((t) => [t.name, t.rank])).toEqual([["Jazz", 1], ["Intimate", 2], ["Documentary", 3]]);
    expect(read.venueTags[0]?.name).toBe("Cozy");
    expect(read.match?.partner.name).toBe("Blue Hour Wine Bar");
    expect(read.match?.runnersUp.map((p) => p.name)).toEqual(["Grand Street Cinema"]);
    expect(read.match?.readAt).toBe(read.at);
    expect(read.shared.map((t) => t.name)).toEqual(["Jazz", "indie", "Documentary", "Cozy", "Working", "Coffee", "Cafe"]);
    expect(read.match?.shared).toEqual(read.shared);
    expect(read.gaps[0]?.because.map((b) => b.text)).toEqual(["Carried by Blue Hour Wine Bar, not by Cafe Lumen"]);

    expect(read.lovedPlaces.map((p) => [p.name, p.distanceM])).toEqual([
      ["Blue Hour Wine Bar", 176],
      ["Kettle Books", 241],
      ["Sora Ramen", 525],
      ["Daybreak Cafe", 109],
      ["Grand Street Cinema", 742],
    ]);
    expect(read.lovedPlaces[0]?.because.map((b) => b.text)).toEqual([
      "Ranked among 5 places within 1.2 km for people who like Cafe Lumen",
      "Tagged Natural Wine, which the street around Cafe Lumen and its audience both carry",
    ]);
    expect(read.lovedPlaces[0]?.hours?.thursday).toEqual([{ opens: "17:00", closes: "23:30" }]);

    expect([...new Set(read.rising.map((r) => r.type))]).toEqual(["artist", "book", "movie", "podcast"]);
    expect(read.rising.every((r) => r.trend === "unknown" && r.trendNote === undefined)).toBe(true);
    const alice = read.rising.find((r) => r.name === "Alice Coltrane")!;
    expect(alice.because.map((b) => b.kind)).toEqual(["explainability", "tag"]);
    expect(alice.because[1]?.text).toBe("Tagged Jazz, which the street around Cafe Lumen and its audience both carry");

    expect(read.heat.map((h) => [h.label, h.cells.length])).toEqual([
      ["Where the taste for Cafe Lumen runs strongest", 5],
      ["Where places like Cafe Lumen run strongest", 3],
    ]);
    expect(read.demographics).toBeUndefined();

    expect(read.limits).toEqual([
      "Qloo scores the street's taste tags almost level, so they are shown as a set, not a ranking.",
      "Qloo returned no TV shows for Cafe Lumen.",
      "Qloo did not use Cafe Lumen itself for the podcasts, so those picks reflect the area only and are not ranked.",
      FIRST_READ_LIMIT,
      NO_DEMOGRAPHICS,
      RANK_LIMIT,
      AGGREGATE_LIMIT,
    ]);
  });

  it("keeps none of Qloo's long text fields", async () => {
    const read = await readStreet(setup().q, VENUE);
    expect(JSON.stringify(read)).not.toMatch(/akas|short_descriptions|ambience_description/);
  });

  it("turns a failed optional call into a limits line and keeps the rest", async () => {
    const broken: Route = (url) => (url.pathname === "/v2/analysis/compare" ? { status: 500, body: { errors: [{ message: "boom" }] } } : undefined);
    const read = await readStreet(setup([broken]).q, VENUE);
    expect(read.limits[0]).toBe("Cafe Lumen compared with Blue Hour Wine Bar failed (Qloo server error), so that part of the read is missing.");
    expect(read.provenance.some((p) => p.call === "compare")).toBe(false);
    expect(read.shared.map((t) => t.name)).toEqual(["Jazz", "indie", "Documentary", "Cozy", "Working", "Cafe"]);
    expect(read.gaps).toEqual([]);
    expect(read.lovedPlaces).toHaveLength(5);
    expectValidProvenance(read);
  });

  it("keeps going when the places and heatmaps time out", async () => {
    const slow: Route = (url) => {
      const t = url.searchParams.get("filter.type");
      return t === "urn:entity:place" || t === "urn:heatmap" ? "hang" : undefined;
    };
    const read = await readStreet(setup([slow], { timeoutMs: 20 }).q, VENUE);
    expect(read.lovedPlaces).toEqual([]);
    expect(read.heat).toEqual([]);
    expect(read.limits).toContain("Nearby places failed (timed out), so that part of the read is missing.");
    expect(read.limits).toContain("No place near Cafe Lumen that hosts people came back from Qloo, so there is no neighbour to match with yet.");
    expect(read.match).toBeUndefined();
    expect(read.limits.some((l) => l.startsWith("Venue heatmap failed"))).toBe(true);
    expectValidProvenance(read);
  });

  it("throws on an auth error", async () => {
    const denied: Route = (url) => (url.pathname === "/v2/analysis/compare" ? { status: 401, body: { error: { message: "Unauthorized", reason: "API keys mismatch" } } } : undefined);
    const err = await readStreet(setup([denied]).q, VENUE).catch((e) => e);
    expect(err).toBeInstanceOf(QlooError);
    expect(err.kind).toBe("auth");
  });

  it("throws instead of returning an empty read when nothing answers", async () => {
    const down: Route = () => ({ status: 502, body: {} });
    const err = await readStreet(setup([down]).q, VENUE).catch((e) => e);
    expect(err.kind).toBe("server");
    const spent = await readStreet(setup([], { budget: async () => false }).q, VENUE).catch((e) => e);
    expect(spent.kind).toBe("budget");
  });

  it("stops cleanly when the daily budget runs out mid read", async () => {
    let left = 5;
    const read = await readStreet(setup([], { budget: async () => left-- > 0 }).q, VENUE);
    expect(read.limits[0]).toBe("The daily Qloo call budget ran out during this read, so the remaining calls were skipped.");
    expect(read.provenance).toHaveLength(5);
    expectValidProvenance(read);
  });

  it("labels cached calls with their fetch time", async () => {
    const store = new Map<string, unknown>();
    const cache: QlooCache = { get: async (k) => store.get(k), put: async (k, v) => void store.set(k, v) };
    await readStreet(setup([], { cache, now: () => new Date("2026-10-25T09:00:00Z") }).q, VENUE);
    const second = setup([], { cache, now: () => new Date("2026-10-25T12:30:00Z") });
    const read = await readStreet(second.q, VENUE);
    expect(second.calls).toHaveLength(0);
    expect(read.provenance.every((p) => p.cached)).toBe(true);
    expect(read.limits.at(-1)).toBe("12 of 12 Qloo calls came from the cache, fetched 2026-10-25 09:00 UTC.");
  });

  it("sends the features of recent nights as exclusions", async () => {
    const { q, calls } = setup();
    const read = await readStreet(q, VENUE, { exclude: [{ id: "FILM-9", name: "Paterson", type: "movie" }] });
    const media = calls.filter((c) => /^urn:entity:(artist|book|movie|tv_show|podcast)$/.test(c.url.searchParams.get("filter.type") ?? ""));
    expect(media.every((c) => c.url.searchParams.get("filter.exclude.entities") === "FILM-9")).toBe(true);
    expect(read.limits).toContain("Left out because you ran them: Paterson.");
  });

  it("notes how each pick moved since last week's read without claiming a trend", async () => {
    const before = await readStreet(setup().q, VENUE);
    const lastWeek: StreetRead = {
      ...before,
      at: "2026-10-18T09:00:00.000Z",
      rising: before.rising
        .filter((r) => r.name !== "Khruangbin")
        .map((r) => (r.name === "Sade" ? { ...r, rank: 1 } : r.name === "Alice Coltrane" ? { ...r, rank: 2 } : r)),
    };
    const read = await readStreet(setup().q, VENUE, { previous: lastWeek });
    const pick = (name: string) => read.rising.find((r) => r.name === name);
    expect(pick("Alice Coltrane")).toMatchObject({ trend: "unknown", trendNote: "#1 in this read, #2 in the read of 2026-10-18" });
    expect(pick("Khruangbin")?.trendNote).toBe("New among Qloo's artists for Cafe Lumen since the read of 2026-10-18");
    expect(pick("Paterson")?.trendNote).toBe("Also #1 in the read of 2026-10-18");
    expect(read.limits).toContain("Changes in the picks are measured against the read of 2026-10-18.");
    expectValidProvenance(read);
  });
});
