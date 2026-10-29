import { describe, expect, it } from "vitest";
import { testApp, ORIGIN, published, req } from "../test_app.ts";

describe("public pages", () => {
  it("serve the event page with strict headers and a hashed stylesheet", async () => {
    const h = testApp();
    const p = await published(h);
    const res = await req(h, `/e/${p.night.eventSlug}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/style-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("tile.openstreetmap.org");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    const html = await res.text();
    expect(html).toContain("Jazz on vinyl night");
    expect(html).not.toContain("said they are coming");
    expect(html).toContain("I am going");
    expect(html).toContain("has not confirmed it");
  });

  it("count one RSVP per browser and redirect back to the page", async () => {
    const h = testApp();
    const p = await published(h);
    const first = await req(h, `/e/${p.night.eventSlug}/rsvp`, { method: "POST", headers: { origin: ORIGIN } });
    expect(first.status).toBe(303);
    expect(first.headers.get("location")).toBe(`/e/${p.night.eventSlug}#rsvp`);
    const cookie = (first.headers.get("set-cookie") ?? "").split(";")[0]!;
    expect(first.headers.get("set-cookie")).toContain("HttpOnly");
    expect(first.headers.get("set-cookie")).toContain("Secure");
    const again = await req(h, `/e/${p.night.eventSlug}/rsvp`, { method: "POST", headers: { origin: ORIGIN, cookie, accept: "application/json" } });
    expect(await again.json()).toEqual({ count: 1, already: true });
    const otherBrowser = await req(h, `/e/${p.night.eventSlug}/rsvp`, { method: "POST", headers: { origin: ORIGIN, accept: "application/json" } });
    expect(await otherBrowser.json()).toEqual({ count: 2, already: false });
    const page = await (await req(h, `/e/${p.night.eventSlug}`, { headers: { cookie } })).text();
    expect(page).not.toContain("2 said they are coming");
    const third = await req(h, `/e/${p.night.eventSlug}/rsvp`, { method: "POST", headers: { origin: ORIGIN, accept: "application/json", "cf-connecting-ip": "203.0.113.8" } });
    expect(await third.json()).toEqual({ count: 3, already: false });
    expect(await (await req(h, `/e/${p.night.eventSlug}`, { headers: { cookie } })).text()).toContain("3 said they are coming");
    expect(page).toContain("You are on the list");
  });

  it("count at most three RSVPs per night from one address, however often the cookie is dropped", async () => {
    const h = testApp();
    const p = await published(h);
    const post = () => req(h, `/e/${p.night.eventSlug}/rsvp`, { method: "POST", headers: { origin: ORIGIN, accept: "application/json" } });
    for (let i = 1; i <= 3; i++) expect(await (await post()).json()).toEqual({ count: i, already: false });
    expect((await post()).status).toBe(429);
  });

  it("refuse JSON RSVPs that do not say where they came from", async () => {
    const h = testApp();
    const p = await published(h);
    expect((await req(h, `/e/${p.night.eventSlug}/rsvp`, { method: "POST", headers: { accept: "application/json" } })).status).toBe(403);
    expect((await req(h, `/e/${p.night.eventSlug}/rsvp`, { method: "POST", headers: { origin: ORIGIN, "sec-fetch-site": "same-site" } })).status).toBe(403);
  });

  it("take a page offline after three reports from different people", async () => {
    const h = testApp();
    const p = await published(h);
    for (const ip of ["198.51.100.1", "198.51.100.2", "198.51.100.3"]) {
      const res = await req(h, `/e/${p.night.eventSlug}/report`, { method: "POST", headers: { origin: ORIGIN, "cf-connecting-ip": ip } });
      expect(res.status).toBe(200);
    }
    expect((await req(h, `/e/${p.night.eventSlug}`)).status).toBe(404);
  });

  it("refuse cross site RSVPs", async () => {
    const h = testApp();
    const p = await published(h);
    expect((await req(h, `/e/${p.night.eventSlug}/rsvp`, { method: "POST", headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect((await req(h, `/e/${p.night.eventSlug}/rsvp`, { method: "POST", headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
  });

  it("serve the calendar file and the printable poster", async () => {
    const h = testApp();
    const p = await published(h);
    const ics = await req(h, `/e/${p.night.eventSlug}.ics`);
    expect(ics.status).toBe(200);
    expect(ics.headers.get("content-type")).toContain("text/calendar");
    expect(await ics.text()).toContain("DTSTART:20261105T180000Z");
    const poster = await req(h, `/e/${p.night.eventSlug}/poster`);
    expect(poster.status).toBe(200);
    expect(poster.headers.get("content-security-policy")).toMatch(/script-src 'sha256-/);
    const html = await poster.text();
    expect(html).toContain("<svg");
    expect(html).toContain("@page{size:A4");
  });

  it("only publish what the owner approved", async () => {
    const h = testApp();
    const p = await published(h, ["ics"]);
    expect((await req(h, `/e/${p.night.eventSlug}`)).status).toBe(404);
    expect((await req(h, `/e/${p.night.eventSlug}/poster`)).status).toBe(404);
    expect((await req(h, `/e/${p.night.eventSlug}.ics`)).status).toBe(200);
    expect((await req(h, `/e/${p.night.eventSlug}/rsvp`, { method: "POST", headers: { origin: ORIGIN, accept: "application/json" } })).status).toBe(404);
  });

  it("404 unknown or malformed slugs without touching a venue", async () => {
    const h = testApp();
    expect((await req(h, "/e/<script>")).status).toBe(404);
    expect((await req(h, "/e/jazz-abcdefghijkm-abcde")).status).toBe(404);
  });
});
