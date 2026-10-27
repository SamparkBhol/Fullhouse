import { describe, expect, it } from "vitest";
import {
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

  it("repeats array params when asked", () => {
    const qs = buildQuery({ "filter.tag.types": ["urn:tag:genre:music", "urn:tag:ambience:qloo"] }, "repeat");
    const sp = new URLSearchParams(qs);
    expect(sp.getAll("filter.tag.types")).toEqual(["urn:tag:genre:music", "urn:tag:ambience:qloo"]);
  });

  it("drops empty values and anything that looks like a secret", () => {
    const qs = buildQuery({ a: "", b: ["", " "], api_key: "nope", "x-api-key": "nope", token: "t", c: " keep " });
    expect(qs).toBe("c=keep");
  });

  it("writes WKT points longitude first", () => {
    expect(wktPoint(40.7128, -74.006)).toBe("POINT(-74.006 40.7128)");
    expect(wktPoint(51.50735123456, -0.12775987654)).toBe("POINT(-0.12776 51.507351)");
    expect(parseWktPoint("POINT(-74.006 40.7128)")).toEqual({ lat: 40.7128, lng: -74.006 });
  });

  it("rejects impossible coordinates", () => {
    expect(() => wktPoint(91, 0)).toThrow(RangeError);
    expect(() => wktPoint(0, 181)).toThrow(RangeError);
    expect(() => wktPoint(Number.NaN, 0)).toThrow(RangeError);
    expect(parseWktPoint("POINT(40.7 -100)")).toBeNull();
  });

  it("always pairs a POINT filter with a radius", () => {
    expect(locationFilter(40.72, -73.99, 1200)).toEqual({ "filter.location": "POINT(-73.99 40.72)", "filter.location.radius": "1200" });
    expect(clampRadius(0)).toBe(1);
    expect(clampRadius(9e9)).toBe(800000);
    expect(locationFilter(1, 2, 12.6)["filter.location.radius"]).toBe("13");
  });

  it("leaves signal radius out unless asked", () => {
    expect(locationSignal(40.72, -73.99)).toEqual({ "signal.location": "POINT(-73.99 40.72)" });
    expect(locationSignal(40.72, -73.99, 500)["signal.location.radius"]).toBe("500");
  });

  it("formats search locations as lat,lon with a mile radius", () => {
    expect(searchNear(40.72, -73.99, 250)).toEqual({ "filter.location": "40.72,-73.99", "filter.radius": "100" });
  });

  it("flags POINT rules before a call goes out", () => {
    expect(checkParams({ "filter.location": "POINT(-73.99 40.72)" })).toMatch(/radius/);
    expect(checkParams({ "filter.location": "POINT(-73.99 40.72)", "filter.location.radius": "800" })).toBeNull();
    expect(checkParams({ "filter.location": "POINT(-73.99 40.72)", "filter.radius": "2" })).toBeNull();
    expect(checkParams({ "filter.location": "POINT(40.72 -100.5)", "filter.location.radius": "800" })).toMatch(/longitude first/);
    expect(checkParams({ "signal.location.radius": "800" })).toMatch(/POINT/);
    expect(checkParams({ take: "60" })).toMatch(/take/);
    expect(checkParams({ "filter.location": "81E61924-6CEE-4AB4-93D3-282A5C784AB8" })).toBeNull();
  });

  it("builds URLs only for plain API paths", () => {
    expect(buildUrl("https://hackathon.api.qloo.com/", "/search", { query: "Balthazar" })).toBe("https://hackathon.api.qloo.com/search?query=Balthazar");
    expect(() => buildUrl("https://x", "search", {})).toThrow();
    expect(() => buildUrl("https://x", "//evil.com/a", {})).toThrow();
    expect(() => buildUrl("https://x", "/a?b=c", {})).toThrow();
  });

  it("keeps provenance params readable and keyless", () => {
    expect(provenanceParams({ "filter.type": "urn:tag", ids: ["A", "B"], apikey: "x" })).toEqual({ "filter.type": "urn:tag", ids: "A,B" });
  });

  it("maps entity urns, including legacy and alternate spellings", () => {
    expect(typeFromUrn("urn:entity:place:restaurant")).toBe("place");
    expect(typeFromUrn("urn:entity:video_game")).toBe("videogame");
    expect(typeFromUrn("urn:entity:author")).toBe("person");
    expect(typeFromUrn("urn:entity")).toBeNull();
    expect(typeFromUrn(42)).toBeNull();
  });

  it("spans eight weeks for momentum", () => {
    expect(trendWindow(new Date("2026-10-25T15:00:00Z"))).toEqual({ start: "2026-08-30", end: "2026-10-25" });
  });
});
