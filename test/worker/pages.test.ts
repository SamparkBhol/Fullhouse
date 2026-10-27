import { describe, expect, it } from "vitest";
import { esc, safeHref } from "../../src/worker/pages/html.ts";
import { renderEventPage, renderIcs, renderPoster, type PublicNight } from "../../src/worker/pages/event.ts";
import { PAGE_CSS, pageHashes } from "../../src/worker/pages/style.ts";
import { makeSlug, titleWords, venueIdFromSlug } from "../../src/worker/slug.ts";
import { sha256base64 } from "../../src/worker/tokens.ts";

const EVIL = `<script>alert("x")</script><img src=x onerror=alert(1)>`;

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
    address: "12 Canal Street",
    city: "Berlin",
    lat: 52.52,
    lng: 13.405,
    why: ["Jazz ranks 2nd on this street."],
    rsvps: 3,
    going: false,
    published: { page: true, poster: true, ics: true },
    ...over,
  };
}

const NOW = new Date("2026-10-25T10:00:00Z");

describe("escaping", () => {
  it("escapes every HTML special character", () => {
    expect(esc(`<a href="x" onclick='y'>&\``)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&#96;");
  });

  it("only lets http, https, mailto and same site links through", () => {
    expect(safeHref("javascript:alert(1)")).toBe("#");
    expect(safeHref("//evil.example")).toBe("#");
    expect(safeHref("https://ok.example/?a=1&b=2")).toBe("https://ok.example/?a=1&amp;b=2");
    expect(safeHref("/e/x.ics")).toBe("/e/x.ics");
  });

  it("escapes every owner and Qloo string on the event page", () => {
    const html = renderEventPage(
      night({ title: EVIL, description: EVIL, venueName: EVIL, address: EVIL, city: EVIL, why: [EVIL] }),
      "https://x.example",
      NOW,
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes the poster and keeps only the one hashed script", () => {
    const html = renderPoster(night({ posterHeadline: EVIL, posterSub: EVIL, venueName: EVIL, why: [EVIL] }), "https://x.example");
    expect(html).not.toContain("<img");
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html).toContain("<svg");
  });
});

describe("event page", () => {
  it("shows the date, venue, the Qloo reason, RSVP form, calendar links and noindex", () => {
    const html = renderEventPage(night(), "https://x.example", NOW);
    expect(html).toContain("Thursday 5 November, 19:00 to 22:00");
    expect(html).toContain("Blue Hour Records");
    expect(html).toContain("Picked with Qloo taste data");
    expect(html).toContain('href="/how"');
    expect(html).toContain('<form method="post" action="/e/jazz-night-abcdefghijkm-abcde/rsvp">');
    expect(html).toContain("3 going");
    expect(html).toContain('href="/e/jazz-night-abcdefghijkm-abcde.ics"');
    expect(html).toContain("calendar.google.com");
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:url" content="https://x.example/e/jazz-night-abcdefghijkm-abcde"');
  });

  it("thanks a browser that already said it is going instead of showing the button", () => {
    const html = renderEventPage(night({ going: true }), "https://x.example", NOW);
    expect(html).toContain("You are on the list");
    expect(html).not.toContain("<form");
  });

  it("closes RSVPs once the night is over", () => {
    const html = renderEventPage(night(), "https://x.example", new Date("2026-11-06T12:00:00Z"));
    expect(html).toContain("This night has passed.");
    expect(html).not.toContain("<form");
  });

  it("says when a model wrote the description", () => {
    expect(renderEventPage(night({ writtenBy: "model" }), "https://x.example", NOW)).toContain("written by a language model");
    expect(renderEventPage(night(), "https://x.example", NOW)).not.toContain("language model");
  });

  it("leaves the link and QR code off the poster and calendar file when the page was not approved", () => {
    const n = night({ published: { page: false, poster: true, ics: true } });
    const poster = renderPoster(n, "https://x.example");
    expect(poster).not.toContain("<svg");
    expect(poster).not.toContain('class="p-url"');
    const ics = renderIcs(n, "https://x.example", NOW);
    expect(ics).not.toContain("URL:");
    expect(ics).not.toContain("x.example/e/");
  });

  it("serves a calendar file built from the venue zone", () => {
    const ics = renderIcs(night(), "https://x.example", NOW);
    expect(ics).toContain("DTSTART:20261105T180000Z");
    expect(ics).toContain("URL:https://x.example/e/jazz-night-abcdefghijkm-abcde");
  });

  it("uses no dashes as punctuation and no middle dot meta strings", () => {
    const all = renderEventPage(night(), "https://x.example", NOW) + renderPoster(night(), "https://x.example");
    expect(all).not.toMatch(/[\u2013\u2014\u00b7]/);
    expect(all).not.toMatch(/\s-\s/);
  });

  it("publishes a style hash that matches the inline stylesheet", async () => {
    const h = await pageHashes();
    expect(h.style).toBe(`sha256-${await sha256base64(PAGE_CSS)}`);
  });
});

describe("slugs", () => {
  it("carry the venue id so the page can find its venue", () => {
    const slug = makeSlug("Jazz on Vinyl: Blue Note night!", "abcdefghijkm", "xyz23");
    expect(slug).toBe("jazz-on-vinyl-blue-note-night-abcdefghijkm-xyz23");
    expect(venueIdFromSlug(slug)).toBe("abcdefghijkm");
  });

  it("turn accents and symbols into plain words", () => {
    expect(titleWords("Café Crème & Würst")).toBe("cafe-creme-wurst");
    expect(titleWords("!!!")).toBe("night");
  });

  it("reject anything that is not a Full House slug", () => {
    expect(venueIdFromSlug("../../etc")).toBeNull();
    expect(venueIdFromSlug("jazz-abcdefghijkl-abcde")).toBeNull();
    expect(venueIdFromSlug("jazz")).toBeNull();
    expect(venueIdFromSlug("JAZZ-abcdefghijkm-abcde")).toBeNull();
  });
});
