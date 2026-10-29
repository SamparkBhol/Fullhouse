import { describe, expect, it } from "vitest";
import { esc, safeHref } from "../../src/worker/pages/html.ts";
import { renderEventPage, renderIcs, renderPoster, type PublicNight } from "../../src/worker/pages/event.ts";
import { PAGE_CSS, pageHashes } from "../../src/worker/pages/style.ts";
import { makeSlug, titleWords, venueIdFromSlug } from "../../src/worker/slug.ts";
import { sha256base64 } from "../../src/worker/crypto.ts";

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
    reason: "People who like Blue Hour Records go for jazz",
    source: "Picked with Qloo taste data for people who like Blue Hour Records",
    verified: false,
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
      night({ title: EVIL, description: EVIL, venueName: EVIL, address: EVIL, city: EVIL, reason: EVIL }),
      "https://x.example",
      NOW,
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes the poster and keeps only the one hashed script", () => {
    const html = renderPoster(night({ posterHeadline: EVIL, posterSub: EVIL, venueName: EVIL, reason: EVIL }), "https://x.example");
    expect(html).not.toContain("<img");
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html).toContain("<svg");
  });
});

describe("event page", () => {
  it("shows the date, venue, the Qloo reason, RSVP form, calendar links and noindex", () => {
    const html = renderEventPage(night(), "https://x.example", NOW);
    expect(html).toContain("<span>Thursday 5 November</span><span>19:00 to 22:00</span>");
    expect(html).toContain("Blue Hour Records");
    expect(html).toContain("Picked with Qloo taste data");
    expect(html).toContain('href="/how"');
    expect(html).toContain('<form method="post" action="/e/jazz-night-abcdefghijkm-abcde/rsvp">');
    expect(html).toContain("3 said they are coming");
    expect(html).toContain("<p>People who like Blue Hour Records go for jazz.</p>");
    expect(html).not.toMatch(/ranks \d|1st/);
    expect(html).toContain("Times are local to the venue, Berlin time.");
    expect(html).toContain('href="/e/jazz-night-abcdefghijkm-abcde.ics"');
    expect(html).toContain("calendar.google.com");
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:url" content="https://x.example/e/jazz-night-abcdefghijkm-abcde"');
  });

  it("thanks a browser that already said it is going instead of showing the button", () => {
    const html = renderEventPage(night({ going: true }), "https://x.example", NOW);
    expect(html).toContain("You are on the list");
    expect(html).not.toContain("/rsvp");
  });

  it("closes RSVPs once the night is over", () => {
    const html = renderEventPage(night(), "https://x.example", new Date("2026-11-06T12:00:00Z"));
    expect(html).toContain("This night has passed.");
    expect(html).not.toContain("/rsvp");
  });

  it("headlines the feature under the kind of night on the page and the poster", () => {
    const html = renderEventPage(night({ kind: "Listening night", feature: "Alice Coltrane" }), "https://x.example", NOW);
    expect(html).toContain('<p class="kind">Listening night</p><h1>Alice Coltrane</h1>');
    expect(renderPoster(night({ feature: "Alice Coltrane" }), "https://x.example")).toContain("<h1>Alice Coltrane</h1>");
  });

  it("does not repeat the city when the address already names it", () => {
    const html = renderEventPage(night({ address: "12 Canal Street, Berlin" }), "https://x.example", NOW);
    expect(html).toContain("<span>12 Canal Street, Berlin</span>");
    expect(html).not.toContain("Berlin, Berlin");
  });

  it("marks an unconfirmed venue with one word beside its name, never on the poster, and offers a report button", () => {
    const html = renderEventPage(night(), "https://x.example", NOW);
    expect(html).toContain('<span class="top-venue"><span class="top-name">Blue Hour Records</span><details class="state"><summary>unconfirmed</summary>');
    expect(html).toContain("has not confirmed that from an address on its own website yet.");
    expect(html).toContain('<form method="post" action="/e/jazz-night-abcdefghijkm-abcde/report">');
    expect(renderPoster(night(), "https://x.example")).not.toMatch(/unconfirmed|not confirmed/);
    const confirmed = renderEventPage(night({ verified: true }), "https://x.example", NOW);
    expect(confirmed).not.toContain("unconfirmed");
    expect(confirmed).toContain("confirmed by Blue Hour Records.");
  });

  it("prints a short address on the poster and keeps the partner off it until the partner confirmed its stop", () => {
    const stops = [
      { at: "venue" as const, name: "Blue Hour Records", start: "19:00", end: "20:00", what: "Round one", walkMin: 3 },
      { at: "partner" as const, name: "Kaffee Kanal", start: "20:15", end: "22:00", what: "Round two" },
    ];
    const proposed = renderPoster(night({ shortSlug: "e-abcdefghijkm-xyz23", stops, partner: { name: "Kaffee Kanal", walkMin: 3, hosts: false, answered: "link", confirmed: false } }), "https://x.example");
    expect(proposed).toContain('<p class="p-url">x.example/e/e-abcdefghijkm-xyz23</p>');
    expect(proposed).not.toContain("Kaffee Kanal");
    const confirmed = renderPoster(night({ stops, partner: { name: "Kaffee Kanal", walkMin: 3, hosts: false, answered: "link", confirmed: true } }), "https://x.example");
    expect(confirmed).toContain("With Kaffee Kanal");
    expect(confirmed).toContain("20:15");
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

describe("event page text", () => {
  it("leads with the feature and who made it, and keeps the yes count back until three people said yes", () => {
    const two = renderEventPage(night({ feature: "Las Culturistas", by: "Matt Rogers and Bowen Yang", rsvps: 2 }), "https://x.example", NOW);
    expect(two).toContain("<h1>Las Culturistas</h1>");
    expect(two).toContain('<p class="by">Matt Rogers and Bowen Yang</p>');
    expect(two).not.toContain("said they are coming");
    expect(two).toContain("I am going");
    expect(renderEventPage(night({ rsvps: 3 }), "https://x.example", NOW)).toContain("3 said they are coming");
  });
});

describe("invite page", () => {
  it("escapes every name from Qloo and the owner", async () => {
    const { renderInvitePage } = await import("../../src/worker/pages/invite.ts");
    const html = renderInvitePage(
      {
        slug: "x-abcdefghijkm-abcdefghijkm",
        status: "waiting",
        venue: { name: EVIL, address: EVIL },
        partner: { name: EVIL },
        walkMin: 3,
        verified: false,
        night: { date: "2026-11-05", start: "19:00", end: "22:00", tz: "Europe/Berlin", kind: "Book night", feature: EVIL, at: EVIL },
        split: { venue: 50, partner: 50 },
        shared: [EVIL],
      },
      "https://x.example",
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
  });
});

describe("the night as two stops", () => {
  const stops = [
    { at: "venue" as const, name: "Blue Hour Records", start: "19:00", end: "20:00", what: "Round one", walkMin: 3, address: "12 Canal Street" },
    { at: "partner" as const, name: "Kaffee Kanal", start: "20:15", end: "22:00", what: "Round two", afterHours: true },
  ];

  it("keeps one item per stop, in each place's colour, with the walk inside the first and a maps link where there is an address", () => {
    const html = renderEventPage(night({ stops, partner: { name: "Kaffee Kanal", walkMin: 3, hosts: false } }), "https://x.example", NOW);
    expect(html).not.toContain("tells its regulars");
    const list = /<ol class="stops">(.*?)<\/ol>/.exec(html)?.[1] ?? "";
    expect(list.match(/<li /g)).toHaveLength(2);
    expect(list).toMatch(/<li class="stop stop-you">.*Then about 3 minutes on foot to Kaffee Kanal<\/p><\/li><li class="stop stop-them">/);
    expect(list).toContain('href="https://www.openstreetmap.org/search?query=Blue%20Hour%20Records%2C%2012%20Canal%20Street"');
    expect(list.match(/Open in maps/g)).toHaveLength(1);
    expect(list).toContain("Opens late for it");
  });

  it("marks the partner's stop as proposed until the partner set its own, and says how the yes came", () => {
    const proposed = [stops[0]!, { ...stops[1]!, proposed: true }];
    const before = renderEventPage(night({ stops: proposed, partner: { name: "Kaffee Kanal", walkMin: 3, hosts: false, answered: "link", confirmed: false } }), "https://x.example", NOW);
    expect(before).toContain("Proposed, subject to Kaffee Kanal&#39;s programme");
    expect(before).toContain("Kaffee Kanal answered through an invite link. Its stop is proposed, subject to its own programme.");
    const after = renderEventPage(night({ stops, partner: { name: "Kaffee Kanal", walkMin: 3, hosts: false, answered: "link", confirmed: true, tellsRegulars: true } }), "https://x.example", NOW);
    expect(after).toContain("Kaffee Kanal answered through an invite link and set its own time and what runs there. It tells its regulars too.");
    expect(after).not.toContain("Proposed");
  });

  it("credits Qloo once, in the footer, and never starts a line with its name", () => {
    const html = renderEventPage(night(), "https://x.example", NOW);
    const text = html.replace(/<style>.*?<\/style>/s, "").replace(/<a href="https:\/\/calendar[^"]*"/, "");
    expect(text.match(/Qloo/g)).toHaveLength(1);
    expect(/<footer[^>]*>.*Qloo.*<\/footer>/s.test(text)).toBe(true);
    expect(text).not.toMatch(/>\s*Qloo/);
  });
});

describe("invite page pair", () => {
  it("shows the score with Full House's verdict, the venue in green and the partner in plum, and the partner's yes in plum", async () => {
    const { renderInvitePage } = await import("../../src/worker/pages/invite.ts");
    const html = renderInvitePage(
      {
        slug: "x-abcdefghijkm-abcdefghijkm",
        status: "waiting",
        venue: { name: "Blue Hour Records", image: "/img/i/v.jpg", kind: "record shop", address: "12 Canal Street, Berlin" },
        partner: { name: "Kaffee Kanal", image: "/img/i/p.jpg" },
        walkMin: 3,
        verified: false,
        night: { date: "2026-11-05", start: "19:00", end: "22:00", tz: "Europe/Berlin", kind: "Book night", at: "Blue Hour Records" },
        split: { venue: 52, partner: 48 },
        shared: ["Jazz"],
        score: 88,
      },
      "https://x.example",
    );
    expect(html).toContain('<p class="score">88 <span>of 100</span></p><p class="verdict-head">A strong pair</p>');
    expect(html).toContain('<div class="door door-you"><span class="door-photo"><span class="door-word" aria-hidden="true">Blue Hour Records</span><img src="/img/i/v.jpg" alt="Blue Hour Records, from the street"');
    expect(html).toContain('<small class="door-sub">Record shop, 12 Canal Street</small>');
    expect(html).toContain('<div class="door door-them"><span class="door-photo"><span class="door-word" aria-hidden="true">Kaffee Kanal</span><img src="/img/i/p.jpg" alt="Kaffee Kanal, from the street"');
    expect(html).toContain("about 3 min on foot");
    expect(html).toContain('<button class="btn btn-them" type="submit" name="answer" value="yes">We\'re in</button>');
    expect(html).not.toMatch(/\sstyle=/);
    expect(html.match(/Qloo/g)).toHaveLength(1);
  });
});
