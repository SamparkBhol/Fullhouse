import { describe, expect, it } from "vitest";
import type { LovedPlace, Rising } from "../../src/shared/contract.ts";
import { renderEventPage, renderPoster, type PublicNight } from "../../src/worker/pages/event.ts";
import { featureArt, nearbyPlaces } from "../../src/worker/pages/event_art.ts";

const COVER = "https://images.qloo.com/i/2575A4C0-5459-42E9-B119-FE7CFC8D558B-420x-auto.jpg";
const NOW = new Date("2026-10-25T10:00:00Z");

function feature(over: Partial<Rising> = {}): Rising {
  return { id: "a1", name: "Alice Coltrane", type: "artist", rank: 1, trend: "unknown", because: [], image: COVER, ...over };
}

function place(over: Partial<LovedPlace> = {}): LovedPlace {
  return { id: "p1", name: "Tin Cup", type: "place", lat: 0, lng: 0, distanceM: 410, rank: 1, tags: [], because: [], image: COVER, ...over };
}

function night(over: Partial<PublicNight> = {}): PublicNight {
  return {
    slug: "jazz-night-abcdefghijkm-abcde",
    nightId: "abcdefghijkmnp",
    title: "Jazz night",
    description: "Records all evening.",
    posterHeadline: "Jazz on vinyl",
    posterSub: "A listening night",
    writtenBy: "template",
    date: "2026-11-05",
    start: "19:00",
    end: "22:00",
    tz: "Europe/Berlin",
    venueName: "Blue Hour Records",
    city: "Berlin",
    lat: 52.52,
    lng: 13.405,
    reason: "The artist Qloo ranks 1st for people who like Blue Hour Records",
    verified: false,
    rsvps: 3,
    going: false,
    published: { page: true, poster: true, ics: true },
    ...over,
  };
}

describe("art on the public pages", () => {
  it("takes the feature's cover through this site's image path at its true shape", () => {
    expect(featureArt({ feature: feature() })).toEqual({ image: "/img/i/2575A4C0-5459-42E9-B119-FE7CFC8D558B-420x-auto.jpg", shape: "square" });
    expect(featureArt({ feature: feature({ type: "book" }) })?.shape).toBe("portrait");
    expect(featureArt({ feature: feature({ image: "https://evil.example/a.jpg" }) })).toBeNull();
    expect(featureArt({ feature: null })).toBeNull();
  });

  it("lists up to three nearby places with walking minutes and never calls them partners", () => {
    const places = nearbyPlaces([place(), place({ name: "Two", distanceM: 30, image: undefined }), place({ name: "Three" }), place({ name: "Four" })], "Blue Hour Records");
    expect(places.map((p) => p.name)).toEqual(["Tin Cup", "Two", "Three"]);
    expect(places.map((p) => p.walkMin)).toEqual([5, 1, 5]);
    expect(places[1]?.image).toBeUndefined();
    expect(places.every((p) => !/partner/i.test(p.reason))).toBe(true);
  });

  it("prints the cover beside the headline on the event page and the poster, from this site only", () => {
    const n = night({ feature: "Alice Coltrane", art: { image: "/img/i/a-420x-auto.jpg", shape: "square" }, nearby: nearbyPlaces([place()], "Blue Hour Records") });
    const page = renderEventPage(n, "https://x.example", NOW);
    expect(page).toContain('<div class="head"><h1>Alice Coltrane</h1><span class="print print-square"><img src="/img/i/a-420x-auto.jpg" alt=""');
    expect(page).toContain("Close by, for before or after");
    expect(page).toContain("5 min walk");
    expect(page).not.toContain("images.qloo.com");
    const poster = renderPoster(n, "https://x.example");
    expect(poster).toContain("<h1>Alice Coltrane</h1>");
    expect(poster).toContain('class="print print-square"');
  });

  it("says a reason every nearby place shares once, above the postcards, and keeps names free of spaced dashes", () => {
    const nearby = nearbyPlaces([place({ name: ["Angelika Film Center & Cafe", "New York"].join(" - ") }), place({ name: "Two" })], "Blue Hour Records");
    const page = renderEventPage(night({ nearby }), "https://x.example", NOW);
    expect(page.match(/Loved by people who like Blue Hour Records/g)).toHaveLength(1);
    expect(page).toContain('<p class="near-why">Loved by people who like Blue Hour Records.</p>');
    expect(page).toContain("<strong>Angelika Film Center &amp; Cafe, New York</strong>");
    expect(page).not.toContain(" - New York");
  });

  it("leaves the flyer as type alone when the night has no cover", () => {
    const page = renderEventPage(night({ feature: "Alice Coltrane" }), "https://x.example", NOW);
    expect(page).not.toContain('class="head"');
    expect(page).not.toContain("Close by");
  });
});
