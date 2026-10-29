import { beforeAll, describe, expect, it } from "vitest";
import { planJoint } from "../../../src/core/joint/plan.ts";
import type { NightPlan, Rising, StreetRead, Venue } from "../../../src/shared/contract.ts";
import { NOW, VENUE } from "../../fixtures/street.ts";
import { fixtureRead } from "../plan_setup.ts";
import { CINEMA, matchWith, pick } from "./helpers.ts";

let read: StreetRead;

beforeAll(async () => {
  read = await fixtureRead();
});

function ids(): () => string {
  let n = 0;
  return () => `joint-${++n}`;
}

function plan(joint: Rising[], venue: Venue = VENUE, input = {}) {
  return planJoint(read, joint, venue, matchWith(), input, NOW, "owner", ids());
}

const EVEN = [pick("Pachinko", "book", 1, 0.7, 0.3), pick("The Farewell", "movie", 2, 0.52, 0.48), pick("Alice Coltrane", "artist", 1, 0.6, 0.4)];

function publicText(p: NightPlan): string {
  return [p.copy.eventTitle, p.copy.eventDescription, p.copy.posterHeadline, p.copy.posterSub, p.copy.social].join("\n");
}

describe("the joint night", () => {
  it("is built on the pick nearest half and half, with the split and what both crowds share as the reason", () => {
    const { plan: night } = plan(EVEN);
    expect(night.feature?.name).toBe("The Farewell");
    expect(night.format).toBe("film");
    expect(night.match?.split).toEqual({ venue: 52, partner: 48 });
    expect(night.match?.partner.name).toBe("Grand Street Cinema");
    expect(night.partners.map((p) => p.name)).toEqual(["Grand Street Cinema"]);
    const why = night.why.map((b) => b.text);
    expect(why[0]).toContain("people who like Cafe Lumen and Grand Street Cinema");
    expect(why).toContain("Cafe Lumen crowd 52, Grand Street Cinema crowd 48, from Qloo's explainability for The Farewell with both places as the signal");
    expect(why).toContain("Both crowds go for Jazz, Documentary and Cozy");
    expect(night.why.every((b) => b.provenance >= 0)).toBe(true);
  });

  it("is hosted by whichever of the two suits the format", () => {
    expect(plan(EVEN).plan.match?.host).toBe("partner");
    const bookshop: Venue = { ...VENUE, entity: { ...VENUE.entity, tags: ["urn:tag:genre:place:book_store", "urn:tag:genre:place:cafe"] } };
    const books = plan([pick("Pachinko", "book", 1, 0.5, 0.5)], bookshop).plan;
    expect(books.format).toBe("book");
    expect(books.match?.host).toBe("venue");
    expect(books.why.some((b) => b.text === "A book night suits Cafe Lumen, so Cafe Lumen hosts it and both names go on it once Grand Street Cinema says yes")).toBe(true);
    const podcast = plan([pick("2 Dope Queens", "podcast", 1, 0.5, 0.5)]).plan;
    expect(podcast.match?.host).toBe("venue");
  });

  it("offers the other even picks as other ideas, one per format", () => {
    const { alternatives } = plan(EVEN);
    expect(alternatives[0]?.feature?.name).toBe("Alice Coltrane");
    expect(alternatives[0]?.match?.split).toEqual({ venue: 60, partner: 40 });
    expect(new Set([plan(EVEN).plan.format, ...alternatives.map((a) => a.format)]).size).toBe(1 + alternatives.length);
  });

  it("keeps formats the owner ruled out", () => {
    expect(plan(EVEN, VENUE, { avoidFormats: ["film"] }).plan.feature?.name).toBe("Alice Coltrane");
  });

  it("says so and falls back to the venue's own top pick, worded as the venue's, when no split is near even", () => {
    const lopsided = [pick("Pachinko", "book", 1, 0.8, 0.2), pick("The Farewell", "movie", 1, 0.2, 0.8)];
    const { plan: night } = plan(lopsided);
    expect(night.match?.split).toBeNull();
    expect(night.limits[0]).toBe("No pick in the joint read came out near half and half between the two crowds (35 to 65), so this night is built on Cafe Lumen's own top pick.");
    expect(night.feature?.because[0]?.text).toContain("for people who like Cafe Lumen,");
    expect(night.feature?.because[0]?.text).not.toContain("Grand Street Cinema");
    expect(night.partners.map((p) => p.name)).toEqual(["Grand Street Cinema"]);
  });

  it("says Qloo could not split the picks when the partner was left out of every answer", () => {
    const solo = EVEN.map((r) => ({ ...r, explain: [r.explain![0]!] }));
    expect(plan(solo).plan.limits[0]).toBe("Qloo could not split any pick between Cafe Lumen and Grand Street Cinema, so this night is built on Cafe Lumen's own top pick.");
  });

  it("never names the partner in public copy unless the night is held at the partner's place", () => {
    const bookshop: Venue = { ...VENUE, entity: { ...VENUE.entity, tags: ["urn:tag:genre:place:book_store"] } };
    const atVenue = plan([pick("Pachinko", "book", 1, 0.5, 0.5)], bookshop).plan;
    expect(publicText(atVenue)).not.toContain(CINEMA.name);
    expect(atVenue.copy.partnerPitch.body).not.toContain(CINEMA.name);
    expect(atVenue.copy.partnerPitch.body).toContain("both names go on the event page once you say yes");
    expect(atVenue.copy.partnerPitch.body).toContain("both crowds go for jazz, documentary and cozy");
    const atPartner = plan(EVEN).plan;
    expect(atPartner.copy.eventTitle).toContain("Grand Street Cinema");
    expect(atPartner.copy.partnerPitch.body).toContain("at your place");
  });

  it("gives a bookshop no menu ideas, because it is not food led", () => {
    const bookshop: Venue = { ...VENUE, entity: { ...VENUE.entity, tags: ["urn:tag:genre:place:book_store", "urn:tag:genre:place:cafe"] } };
    expect(plan([pick("Pachinko", "book", 1, 0.5, 0.5)], bookshop).plan.menuIdeas).toEqual([]);
    expect(plan([pick("Pachinko", "book", 1, 0.5, 0.5)]).plan.menuIdeas.length).toBeGreaterThan(0);
  });
});
