import { describe, expect, it } from "vitest";
import {
  TYPE_URN,
  buildQuery,
  buildUrl,
  checkParams,
  clampRadius,
  locationFilter,
  locationSignal,
  parseWktPoint,
  provenanceParams,
  searchNear,
  trendWindow,
  typeFromUrn,
  wktPoint,
} from "../../src/core/index.ts";

describe("request builder", () => {
  it("joins array params with commas and sorts keys", () => {
    const qs = buildQuery({ take: "10", "signal.interests.entities": ["A", "B"], "filter.type": "urn:entity:artist" });
    expect(qs).toBe("filter.type=urn%3Aentity%3Aartist&signal.interests.entities=A%2CB&take=10");
  });

  it("drops empty values and anything that looks like a secret", () => {
    const qs = buildQuery({ a: "", b: ["", " "], api_key: "nope", "x-api-key": "nope", token: "t", c: " keep " });
    expect(qs).toBe("c=keep");
  });

  it("builds URLs only for plain API paths", () => {
    expect(buildUrl("https://hackathon.api.qloo.com/", "/search", { query: "Cafe Lumen Brooklyn" })).toBe(
      "https://hackathon.api.qloo.com/search?query=Cafe+Lumen+Brooklyn",
    );
    expect(() => buildUrl("https://x", "search", {})).toThrow();
    expect(() => buildUrl("https://x", "//evil.example/a", {})).toThrow();
    expect(() => buildUrl("https://x", "/a?b=c", {})).toThrow();
  });

  it("keeps provenance params readable and keyless", () => {
    expect(provenanceParams({ "filter.type": "urn:tag", ids: ["A", "B"], apikey: "x" })).toEqual({ "filter.type": "urn:tag", ids: "A,B" });
  });
});

describe("locations", () => {
  it("writes WKT points longitude first", () => {
    expect(wktPoint(40.7128, -74.006)).toBe("POINT(-74.006 40.7128)");
    expect(wktPoint(51.50735123456, -0.12775987654)).toBe("POINT(-0.12776 51.507351)");
    expect(parseWktPoint("POINT(-74.006 40.7128)")).toEqual({ lat: 40.7128, lng: -74.006 });
    expect(parseWktPoint("POINT(40.7 -100)")).toBeNull();
  });

  it("rejects impossible coordinates", () => {
    expect(() => wktPoint(91, 0)).toThrow(RangeError);
    expect(() => wktPoint(0, 181)).toThrow(RangeError);
    expect(() => wktPoint(Number.NaN, 0)).toThrow(RangeError);
  });

  it("always pairs a POINT filter with a radius in meters and leaves the signal radius out", () => {
    expect(locationFilter(40.72, -73.99, 1200)).toEqual({ "filter.location": "POINT(-73.99 40.72)", "filter.location.radius": "1200" });
    expect(locationFilter(1, 2, 12.6)["filter.location.radius"]).toBe("13");
    expect(clampRadius(0)).toBe(1);
    expect(clampRadius(9e9)).toBe(800000);
    expect(locationSignal(40.72, -73.99)).toEqual({ "signal.location": "POINT(-73.99 40.72)" });
  });

  it("gives /search a lat,lon pair with a radius in miles", () => {
    expect(searchNear(40.72, -73.99, 250)).toEqual({ "filter.location": "40.72,-73.99", "filter.radius": "100" });
  });
});

describe("checkParams", () => {
  it("holds insights to WKT and a radius on every POINT filter", () => {
    expect(checkParams("/v2/insights", { "filter.location": "POINT(-73.99 40.72)" })).toMatch(/radius/);
    expect(checkParams("/v2/insights", { "filter.location": "POINT(-73.99 40.72)", "filter.location.radius": "800" })).toBeNull();
    expect(checkParams("/v2/insights", { "filter.location": "40.72,-73.99", "filter.location.radius": "800" })).toMatch(/not a lat,lon pair/);
    expect(checkParams("/v2/insights", { "signal.location": "40.72,-73.99" })).toMatch(/not a lat,lon pair/);
    expect(checkParams("/v2/insights", { "filter.location": "POINT(40.72 -100.5)", "filter.location.radius": "800" })).toMatch(/longitude first/);
    expect(checkParams("/v2/insights", { "signal.location.radius": "800" })).toMatch(/POINT/);
    expect(checkParams("/v2/insights", { "filter.location": "81E61924-6CEE-4AB4-93D3-282A5C784AB8" })).toBeNull();
  });

  it("holds /search to lat,lon and at most 100 miles", () => {
    expect(checkParams("/search", { "filter.location": "POINT(-73.99 40.72)" })).toMatch(/not WKT/);
    expect(checkParams("/search", { "filter.location": "40.72,-73.99", "filter.radius": "150" })).toMatch(/100 miles/);
    expect(checkParams("/search", { "filter.location": "40.72,-73.99", "filter.radius": "10" })).toBeNull();
  });

  it("caps take at 50 and holds trending to one entity", () => {
    expect(checkParams("/v2/insights", { take: "60" })).toMatch(/take/);
    expect(checkParams("/v2/trending", { "signal.interests.entities": ["A", "B"] })).toMatch(/exactly one/);
    expect(checkParams("/v2/trending", { "signal.interests.entities": "A" })).toBeNull();
  });
});

describe("urns and dates", () => {
  it("uses the videogame spelling the API accepts and maps the legacy search types", () => {
    expect(TYPE_URN.videogame).toBe("urn:entity:videogame");
    expect(typeFromUrn("urn:entity:place")).toBe("place");
    expect(typeFromUrn("URN:ENTITY:TV_SHOW")).toBe("tv_show");
    expect(typeFromUrn("urn:entity:author")).toBe("person");
    expect(typeFromUrn("urn:entity:video_game")).toBeNull();
    expect(typeFromUrn("urn:entity:locality")).toBeNull();
    expect(typeFromUrn(42)).toBeNull();
  });

  it("spans 26 weeks for a trending window", () => {
    expect(trendWindow(new Date("2026-10-27T15:00:00Z"))).toEqual({ start: "2026-04-28", end: "2026-10-27" });
  });
});
