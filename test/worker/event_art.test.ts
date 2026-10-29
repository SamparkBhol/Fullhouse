import { describe, expect, it } from "vitest";
import type { Rising } from "../../src/shared/contract.ts";
import { renderEventPage, renderPoster, type PublicNight } from "../../src/worker/pages/event.ts";
import { featureArt } from "../../src/worker/pages/event_art.ts";

const COVER = "https://images.qloo.com/i/2575A4C0-5459-42E9-B119-FE7CFC8D558B-420x-auto.jpg";
const NOW = new Date("2026-10-25T10:00:00Z");

function feature(over: Partial<Rising> = {}): Rising {
  return { id: "a1", name: "Alice Coltrane", type: "artist", rank: 1, trend: "unknown", because: [], image: COVER, ...over };
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
    reason: "People who like Blue Hour Records go for jazz",
    source: "Picked with Qloo taste data for people who like Blue Hour Records",
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

  it("prints the cover beside the headline on the event page and the poster, from this site only", () => {
    const n = night({ feature: "Alice Coltrane", art: { image: "/img/i/a-420x-auto.jpg", shape: "square" } });
    const page = renderEventPage(n, "https://x.example", NOW);
    expect(page).toContain('<div class="head"><h1>Alice Coltrane</h1><span class="print print-square"><img src="/img/i/a-420x-auto.jpg" alt=""');
    expect(page).not.toContain("images.qloo.com");
    const poster = renderPoster(n, "https://x.example");
    expect(poster).toContain("<h1>Alice Coltrane</h1>");
    expect(poster).toContain('class="print print-square"');
  });

  it("names the partner only once it said yes, as the other half of the night, without spaced dashes", () => {
    const before = renderEventPage(night(), "https://x.example", NOW);
    expect(before).not.toContain("Put on with");
    expect(before).not.toContain("Close by");
    const name = ["Angelika Film Center & Cafe", "New York"].join(" - ");
    const after = renderEventPage(night({ partner: { name, walkMin: 2, hosts: false } }), "https://x.example", NOW);
    expect(after).toContain("Put on with Angelika Film Center &amp; Cafe, New York");
    expect(after).toContain("2 min walk");
    expect(after).not.toContain(" - New York");
  });

  it("leaves the flyer as type alone when the night has no cover", () => {
    const page = renderEventPage(night({ feature: "Alice Coltrane" }), "https://x.example", NOW);
    expect(page).not.toContain('class="head"');
  });
});
