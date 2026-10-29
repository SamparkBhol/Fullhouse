import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { LovedPlace } from "../../src/shared/contract.ts";
import { mixedLine, partnerReason, pickLine, shapeOf } from "../../web/src/ui/lines.ts";
import { DARK_WINDOW, LAMP_OPACITY, lampFor, roundedWindow } from "../../web/src/ui/map-windows.ts";

describe("covers on the shelf", () => {
  it("stands sleeves and podcasts square and books, films and shows portrait", () => {
    expect(["artist", "podcast", "place"].map((t) => shapeOf(t as never))).toEqual(["square", "square", "square"]);
    expect(["book", "movie", "tv_show", "videogame"].map((t) => shapeOf(t as never))).toEqual(["portrait", "portrait", "portrait", "portrait"]);
  });

  it("gives each cover only its place in the list, since the shelf heading says who it is for", () => {
    expect(pickLine({ rank: 1 })).toBe("1st");
    expect(pickLine({ rank: 3, venueSignal: true })).toBe("3rd");
    expect(pickLine({ rank: 2, venueSignal: false })).toBe("Liked around you, not ranked");
    expect(mixedLine({ rank: 1, type: "book" })).toBe("Top book");
    expect(mixedLine({ rank: 2, type: "movie" })).toBe("2nd film");
    expect(mixedLine({ rank: 2, type: "podcast", venueSignal: false })).toBe("A podcast liked around you");
  });

  it("never writes a dash or a percentage into a shelf line", () => {
    for (const line of [pickLine({ rank: 11 }), mixedLine({ rank: 12, type: "tv_show" })]) {
      expect(line).not.toMatch(/[\u2013\u2014%]| - /);
    }
  });
});

describe("partner cards", () => {
  const base: LovedPlace = { id: "p1", name: "Tin Cup", type: "place", lat: 0, lng: 0, distanceM: 420, rank: 4, tags: [], because: [{ text: "4th among places nearby", kind: "affinity", provenance: 2 }] };

  it("keeps the reason after the walk, since the card shows the walk itself", () => {
    const p = { ...base, because: [...base.because, { text: "About 400 m from Blue Hour Records, tagged Jazz, which is part of this night's theme", kind: "tag" as const, provenance: 2 }] };
    expect(partnerReason(p, "Blue Hour Records")).toBe("Tagged Jazz, which is part of this night's theme");
  });

  it("falls back to the place's rank when the planner gave no reason of its own", () => {
    expect(partnerReason(base, "Blue Hour Records")).toBe("4th nearby for your audience");
  });
});

describe("the night map's windows", () => {
  it("lights stronger cells brighter and leaves cells without a read dark", () => {
    const fills = [0, 1, 2, 3, 4].map((b) => lampFor(b).fillOpacity);
    expect(fills).toEqual(LAMP_OPACITY);
    expect([...fills].sort((a, b) => b - a)).toEqual(fills);
    expect(lampFor(null).fillColor).toBe(DARK_WINDOW);
    expect(lampFor(9)).toEqual(lampFor(4));
  });

  it("draws a window with rounded corners inside its cell", () => {
    const b = { south: 10, north: 11, west: 20, east: 21 };
    const ring = roundedWindow(b);
    expect(ring).toHaveLength(20);
    for (const [lat, lng] of ring) {
      expect(lat).toBeGreaterThanOrEqual(b.south - 1e-9);
      expect(lat).toBeLessThanOrEqual(b.north + 1e-9);
      expect(lng).toBeGreaterThanOrEqual(b.west - 1e-9);
      expect(lng).toBeLessThanOrEqual(b.east + 1e-9);
    }
    const corners = [[11, 21], [11, 20], [10, 20], [10, 21]];
    for (const [lat, lng] of corners) expect(ring.some(([a, o]) => Math.abs(a - lat!) < 1e-9 && Math.abs(o - lng!) < 1e-9)).toBe(false);
  });

  it("recolours only the tile pane, so the windows and photos keep their own colours", () => {
    const css = readFileSync(new URL("../../web/src/styles/street.css", import.meta.url), "utf8");
    const filtered = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{[^}]*\bfilter:/g)].map((m) => m[1]!.trim());
    expect(filtered).toEqual([".map .leaflet-tile-pane", ".map .leaflet-windows-pane"]);
  });
});
