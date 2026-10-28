import { describe, expect, it } from "vitest";
import type { Venue } from "../../src/shared/contract.ts";
import { AGGREGATE_NOTE, gcalUrl, gmailUrl, isEmail, mailtoUrl, outlookUrl, outreachBody } from "../../src/worker/actions/links.ts";
import { runActions, type ActionContext } from "../../src/worker/actions/run.ts";
import { CANDIDATE, fakeFetch, fakePlan, PARTNERS } from "./helpers.ts";

const NOW = new Date("2026-10-25T10:00:00Z");

const VENUE: Venue = {
  id: "abcdefghijkm",
  entity: CANDIDATE,
  city: "Berlin",
  tz: "Europe/Berlin",
  quietSlot: { weekday: 4, start: "19:00", durationMin: 180 },
  capacity: 40,
  ownerEmail: "owner@example.com",
  createdAt: NOW.toISOString(),
};

function ctx(over: Partial<ActionContext> = {}): ActionContext {
  return {
    night: fakePlan("abcdefghijkmnp", VENUE.id, {}, "owner", NOW),
    venue: VENUE,
    input: {},
    actions: ["event_page"],
    partnerEmails: {},
    origin: "https://x.example",
    now: NOW,
    fetch: fakeFetch(() => ({ body: {} })),
    eventbrite: null,
    resend: null,
    ownerLink: "https://x.example/v/abcdefghijkm#t=tok",
    slugRand: () => "xyz23",
    ...over,
  };
}

describe("mail drafts", () => {
  const draft = { to: "bar@example.com", subject: "A jazz night & more", body: "Hello there,\nline two" };

  it("encode mailto with CRLF line breaks and the address", () => {
    const url = mailtoUrl(draft);
    expect(url.startsWith("mailto:bar@example.com?")).toBe(true);
    expect(url).toContain("subject=A%20jazz%20night%20%26%20more");
    expect(url).toContain("body=Hello%20there%2C%0D%0Aline%20two");
  });

  it("leave the address out when the owner typed none or a bad one", () => {
    expect(mailtoUrl({ subject: "s", body: "b" }).startsWith("mailto:?")).toBe(true);
    expect(mailtoUrl({ to: "not an email", subject: "s", body: "b" }).startsWith("mailto:?")).toBe(true);
  });

  it("build Gmail and Outlook compose links with the pitch", () => {
    const g = new URL(gmailUrl(draft));
    expect(g.host).toBe("mail.google.com");
    expect(g.searchParams.get("view")).toBe("cm");
    expect(g.searchParams.get("to")).toBe("bar@example.com");
    expect(g.searchParams.get("su")).toBe(draft.subject);
    expect(g.searchParams.get("body")).toBe(draft.body);
    const o = new URL(outlookUrl(draft));
    expect(o.pathname).toBe("/mail/0/deeplink/compose");
    expect(o.searchParams.get("subject")).toBe(draft.subject);
    expect(o.searchParams.get("to")).toBe("bar@example.com");
  });

  it("always add the aggregate data note, even when the pitch uses the word aggregate", () => {
    expect(outreachBody("Hi", "https://x.example/e/s")).toBe(`Hi\n\nEvent page: https://x.example/e/s\n\n${AGGREGATE_NOTE}`);
    expect(outreachBody("Hi, this is an aggregate signal.")).toBe(`Hi, this is an aggregate signal.\n\n${AGGREGATE_NOTE}`);
    expect(outreachBody(`Hi\n\n${AGGREGATE_NOTE}`)).toBe(`Hi\n\n${AGGREGATE_NOTE}`);
  });

  it("checks email addresses", () => {
    expect(isEmail("a.b+c@shop.example")).toBe(true);
    expect(isEmail("a@b")).toBe(false);
    expect(isEmail("a b@c.example")).toBe(false);
    expect(isEmail(`${"x".repeat(250)}@a.example`)).toBe(false);
  });
});

describe("calendar link", () => {
  it("puts UTC start and end in the dates parameter", () => {
    const u = new URL(
      gcalUrl({ title: "Jazz", details: "d", location: "l", start: new Date("2026-11-05T18:00:00Z"), end: new Date("2026-11-05T21:00:00Z") }),
    );
    expect(u.searchParams.get("action")).toBe("TEMPLATE");
    expect(u.searchParams.get("dates")).toBe("20261105T180000Z/20261105T210000Z");
    expect(u.searchParams.get("text")).toBe("Jazz");
  });
});

describe("runActions", () => {
  it("runs only the approved actions, in a fixed order", async () => {
    const run = await runActions(ctx({ actions: ["gcal", "ics", "event_page", "poster"] }));
    expect(run.results.map((r) => r.kind)).toEqual(["event_page", "poster", "ics", "gcal"]);
    expect(run.slug).toBe("jazz-on-vinyl-night-abcdefghijkm-xyz23");
    expect(run.results[0]?.url).toBe("https://x.example/e/jazz-on-vinyl-night-abcdefghijkm-xyz23");
    expect(run.results[1]?.url).toBe("https://x.example/e/jazz-on-vinyl-night-abcdefghijkm-xyz23/poster");
    expect(run.results[2]?.url).toBe("https://x.example/e/jazz-on-vinyl-night-abcdefghijkm-xyz23.ics");
    expect(run.published).toEqual({ page: true, poster: true, ics: true });
  });

  it("makes no public page when only drafts are approved", async () => {
    const f = fakeFetch(() => ({ body: {} }));
    const run = await runActions(ctx({ actions: ["outreach", "gcal"], fetch: f }));
    expect(run.slug).toBeUndefined();
    expect(run.published).toEqual({ page: false, poster: false, ics: false });
    expect(f.calls).toHaveLength(0);
  });

  it("drafts one email per partner, addressed only where the owner typed an address", async () => {
    const run = await runActions(ctx({ actions: ["event_page", "outreach"], partnerEmails: { [PARTNERS[0]!.id]: "hello@kanal.example", unknown: "x@y.example" } }));
    const drafts = run.results.filter((r) => r.kind === "outreach");
    expect(drafts).toHaveLength(2);
    expect(drafts[0]?.url?.startsWith("mailto:hello@kanal.example?")).toBe(true);
    expect(drafts[0]?.links?.map((l) => l.label)).toEqual(["Mail app", "Gmail", "Outlook"]);
    expect(drafts[1]?.url?.startsWith("mailto:?")).toBe(true);
    expect(decodeURIComponent(drafts[0]?.url ?? "")).toContain("Event page: https://x.example/e/");
    expect(drafts.every((d) => d.detail.includes("Nothing is sent") || d.detail.includes("nothing is sent"))).toBe(true);
  });

  it("reports Eventbrite as not done when it is not connected", async () => {
    const run = await runActions(ctx({ actions: ["eventbrite"] }));
    expect(run.results[0]).toMatchObject({ kind: "eventbrite", ok: false });
  });

  it("emails only the owner, only when email is set up, with the links", async () => {
    const none = await runActions(ctx({ actions: ["owner_email"] }));
    expect(none.results[0]).toMatchObject({ kind: "owner_email", ok: false });

    const f = fakeFetch(() => ({ body: { id: "mail_1" } }));
    const sent = await runActions(ctx({ actions: ["event_page", "owner_email"], fetch: f, resend: { key: "re_key", from: "Full House <a@b.example>" } }));
    expect(sent.results[1]).toMatchObject({ kind: "owner_email", ok: true });
    expect(f.calls).toHaveLength(1);
    const call = f.calls[0]!;
    expect(call.url).toBe("https://api.resend.com/emails");
    expect(call.headers["authorization"]).toBe("Bearer re_key");
    expect((call.body as { to: string[] }).to).toEqual(["owner@example.com"]);
    expect((call.body as { text: string }).text).toContain("https://x.example/e/jazz-on-vinyl-night-abcdefghijkm-xyz23");
  });
});
