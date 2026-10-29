import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { LovedPlace } from "../../src/shared/contract.ts";
import { partnerReason, pickLine, shapeOf } from "../../web/src/ui/lines.ts";
import { HEAT_OPACITY, heatOpacity } from "../../web/src/heat.ts";

describe("pick lines", () => {
  it("stands sleeves and podcasts square and books, films and shows portrait", () => {
    expect(["artist", "podcast", "place"].map((t) => shapeOf(t as never))).toEqual(["square", "square", "square"]);
    expect(["book", "movie", "tv_show", "videogame"].map((t) => shapeOf(t as never))).toEqual(["portrait", "portrait", "portrait", "portrait"]);
  });

  it("give each pick only its place in the list", () => {
    expect(pickLine({ rank: 1 })).toBe("1st");
    expect(pickLine({ rank: 3, venueSignal: true })).toBe("3rd");
    expect(pickLine({ rank: 2, venueSignal: false })).toBe("Liked around you, not ranked");
  });

  it("never write a dash or a percentage into a pick line", () => {
    for (const line of [pickLine({ rank: 11 }), pickLine({ rank: 12, venueSignal: false })]) {
      expect(line).not.toMatch(/[\u2013\u2014%]| - /);
    }
  });
});

describe("places nearby to tell", () => {
  const base: LovedPlace = { id: "p1", name: "Tin Cup", type: "place", lat: 0, lng: 0, distanceM: 420, rank: 4, tags: [], because: [{ text: "4th among places nearby", kind: "affinity", provenance: 2 }] };

  it("keeps the reason after the walk, since the card shows the walk itself", () => {
    const p = { ...base, because: [...base.because, { text: "About 400 m from Blue Hour Records, tagged Jazz, which is part of this night's theme", kind: "tag" as const, provenance: 2 }] };
    expect(partnerReason(p, "Blue Hour Records")).toBe("Tagged Jazz, which is part of this night's theme");
  });

  it("falls back to the place's rank when the planner gave no reason of its own", () => {
    expect(partnerReason(base, "Blue Hour Records")).toBe("4th nearby for your audience");
  });
});

describe("the heat squares on the map", () => {
  it("shades stronger squares darker and draws nothing where there is no read", () => {
    const shades = [0, 1, 2, 3, 4].map((b) => heatOpacity(b));
    expect(shades).toEqual(HEAT_OPACITY);
    expect([...shades].sort((a, b) => b - a)).toEqual(shades);
    expect(heatOpacity(null)).toBe(0);
    expect(heatOpacity(9)).toBe(heatOpacity(4));
  });

  it("recolours only the tile pane, so the pins and squares keep their own colours", () => {
    const css = readFileSync(new URL("../../web/src/styles/map.css", import.meta.url), "utf8");
    const filtered = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{[^}]*\bfilter:/g)].map((m) => m[1]!.trim());
    expect(filtered).toEqual([".map .leaflet-tile-pane"]);
  });
});
