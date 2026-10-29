import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OSM_IMG_HOSTS } from "../../src/worker/http.ts";
import { TILE_URL } from "../../web/src/ui/map-tiles.ts";

const headers = readFileSync(new URL("../../web/public/_headers", import.meta.url), "utf8");

function imgSources(csp: string): string[] {
  const directive = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("img-src "));
  return directive ? directive.split(/\s+/).slice(1) : [];
}

// Leaflet swaps {s} for a, b or c, so a template with {s} must match the wildcard source as well.
function allowed(url: string, sources: string[]): boolean {
  const u = new URL(url.replace("{s}", "a").replace(/\{[xyz]\}/g, "1"));
  return sources.some((src) => {
    if (src === "'self'" || src === "data:") return false;
    const s = new URL(src.replace("*.", "wildcard."));
    if (s.protocol !== u.protocol) return false;
    return src.includes("*.") ? u.hostname.endsWith(`.${s.hostname.slice("wildcard.".length)}`) : u.hostname === s.hostname;
  });
}

describe("map tiles under the page CSP", () => {
  it("loads tiles from a host the app CSP allows", () => {
    const csp = headers.split("\n").find((l) => l.trim().startsWith("Content-Security-Policy:")) ?? "";
    const sources = imgSources(csp.slice(csp.indexOf(":") + 1));
    expect(sources.length).toBeGreaterThan(0);
    expect(allowed(TILE_URL, sources)).toBe(true);
    expect(TILE_URL).toMatch(/^https:\/\/[^/]+\/\{z\}\/\{x\}\/\{y\}\.png$/);
  });

  it("matches the hosts the worker pages allow", () => {
    expect(allowed(TILE_URL, OSM_IMG_HOSTS.split(" "))).toBe(true);
    expect(allowed("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", OSM_IMG_HOSTS.split(" "))).toBe(true);
    expect(allowed("https://tiles.example.org/{z}/{x}/{y}.png", OSM_IMG_HOSTS.split(" "))).toBe(false);
  });
});
