import { describe, expect, it } from "vitest";
import { createEventbriteEvent, currencyForZone, eventbriteOrganization, type EventbriteDraft } from "../../src/worker/actions/eventbrite.ts";
import { fakeFetch, type FetchCall } from "./helpers.ts";

const DRAFT: EventbriteDraft = {
  organizationId: "ORG1",
  name: "Jazz on vinyl night",
  summary: "A listening night",
  descriptionHtml: "<p>Records all evening.</p>",
  timezone: "Europe/Berlin",
  startUtc: "2026-11-05T18:00:00Z",
  endUtc: "2026-11-05T21:00:00Z",
  currency: "EUR",
  capacity: 40,
  venue: { name: "Blue Hour Records", address: "12 Canal Street", city: "Berlin", lat: 52.52, lng: 13.405 },
};

function happy(call: FetchCall): { status?: number; body?: unknown } {
  if (call.url.endsWith("/venues/")) return { body: { id: "V9" } };
  if (call.url.endsWith("/organizations/ORG1/events/")) return { body: { id: "E7", url: "https://www.eventbrite.com/e/jazz-tickets-E7" } };
  if (call.url.endsWith("/ticket_classes/")) return { body: { id: "T1" } };
  if (call.url.endsWith("/publish/")) return { body: { published: true } };
  return { status: 404, body: {} };
}

describe("Eventbrite", () => {
  it("creates the venue, the event, a free ticket class, then publishes, all with the owner's token", async () => {
    const f = fakeFetch(happy);
    const out = await createEventbriteEvent("OWNER_TOKEN", DRAFT, f);
    expect(out).toEqual({ ok: true, url: "https://www.eventbrite.com/e/jazz-tickets-E7", eventId: "E7", venueAttached: true });
    expect(f.calls.map((c) => `${c.method} ${c.url.replace("https://www.eventbriteapi.com/v3", "")}`)).toEqual([
      "POST /organizations/ORG1/venues/",
      "POST /organizations/ORG1/events/",
      "POST /events/E7/ticket_classes/",
      "POST /events/E7/publish/",
    ]);
    for (const c of f.calls) expect(c.headers["authorization"]).toBe("Bearer OWNER_TOKEN");
    const event = (f.calls[1]!.body as { event: Record<string, unknown> }).event;
    expect(event).toMatchObject({
      name: { html: "Jazz on vinyl night" },
      start: { timezone: "Europe/Berlin", utc: "2026-11-05T18:00:00Z" },
      end: { timezone: "Europe/Berlin", utc: "2026-11-05T21:00:00Z" },
      currency: "EUR",
      online_event: false,
      venue_id: "V9",
      capacity: 40,
    });
    expect(f.calls[2]!.body).toEqual({ ticket_class: { name: "Free entry", free: true, quantity_total: 40 } });
    const venue = (f.calls[0]!.body as { venue: { name: string; address: Record<string, string> } }).venue;
    expect(venue.name).toBe("Blue Hour Records");
    expect(venue.address).toMatchObject({ address_1: "12 Canal Street", city: "Berlin", latitude: "52.52", longitude: "13.405" });
  });

  it("puts the address in the description when Eventbrite will not take the venue", async () => {
    const f = fakeFetch((c) => (c.url.endsWith("/venues/") ? { status: 400, body: { error: "ARGUMENT_ERROR" } } : happy(c)));
    const out = await createEventbriteEvent("T", DRAFT, f);
    expect(out).toMatchObject({ ok: true, venueAttached: false });
    const event = (f.calls[1]!.body as { event: Record<string, unknown> }).event;
    expect(event["venue_id"]).toBeUndefined();
    expect((event["description"] as { html: string }).html).toContain("Where: Blue Hour Records, 12 Canal Street, Berlin");
  });

  it("reports the reason when event creation fails and stops there", async () => {
    const f = fakeFetch((c) =>
      c.url.endsWith("/organizations/ORG1/events/") ? { status: 400, body: { error: "ARGUMENT_ERROR", error_description: "There are errors with your arguments: start" } } : happy(c),
    );
    const out = await createEventbriteEvent("T", DRAFT, f);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("There are errors with your arguments: start");
    expect(f.calls).toHaveLength(2);
  });

  it("keeps the draft link when publishing fails", async () => {
    const f = fakeFetch((c) => (c.url.endsWith("/publish/") ? { status: 400, body: { error: "NOT_PUBLISHABLE" } } : happy(c)));
    const out = await createEventbriteEvent("T", DRAFT, f);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("https://www.eventbrite.com/e/jazz-tickets-E7");
  });

  it("asks the owner to reconnect on a 401 and never echoes the token", async () => {
    const f = fakeFetch(() => ({ status: 401, body: { error: "INVALID_AUTH" } }));
    const out = await eventbriteOrganization("SECRET_TOKEN", f);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toContain("Connect Eventbrite again");
      expect(out.reason).not.toContain("SECRET_TOKEN");
    }
  });

  it("reads the first organization", async () => {
    const f = fakeFetch(() => ({ body: { organizations: [{ id: "123", name: "Blue Hour Records" }] } }));
    expect(await eventbriteOrganization("T", f)).toEqual({ ok: true, org: { id: "123", name: "Blue Hour Records" } });
    expect(f.calls[0]!.url).toBe("https://www.eventbriteapi.com/v3/users/me/organizations/");
  });

  it("picks a currency from the venue zone", () => {
    expect(currencyForZone("Europe/London")).toBe("GBP");
    expect(currencyForZone("Europe/Berlin")).toBe("EUR");
    expect(currencyForZone("Asia/Kolkata")).toBe("INR");
    expect(currencyForZone("America/Chicago")).toBe("USD");
  });
});
