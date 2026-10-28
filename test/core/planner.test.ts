import { beforeAll, describe, expect, it } from "vitest";
import { FORMATS, PlanError, checkClaims, briefNames, buildBrief } from "../../src/core/index.ts";
import type { Because, NightPlan, PlanInput, PlanResponse, StreetRead } from "../../src/shared/contract.ts";
import { NOW, VENUE } from "../fixtures/street.ts";
import { fixtureRead, planFrom } from "./plan_setup.ts";

let read: StreetRead;

function plan(input: PlanInput = {}, venue = VENUE, r = read): PlanResponse {
  return planFrom(r, input, venue);
}

function becauseOf(p: NightPlan): Because[] {
  return [
    ...p.why,
    ...(p.feature?.because ?? []),
    ...p.partners.flatMap((x) => x.because),
    ...p.menuIdeas.flatMap((m) => m.because),
  ];
}

beforeAll(async () => {
  read = await fixtureRead();
});

describe("planNights", () => {
  it("is deterministic", () => {
    expect(plan()).toEqual(plan());
  });

  it("picks one night and two alternatives of other formats", () => {
    const res = plan();
    const formats = [res.plan.format, ...res.alternatives.map((a) => a.format)];
    expect(res.alternatives).toHaveLength(2);
    expect(new Set(formats).size).toBe(3);
    expect(res.plan).toMatchObject({ format: "listening", origin: "owner", status: "proposed", venueId: "venue-1", readAt: read.at, id: "plan-1" });
    expect(res.plan.feature?.name).toBe("Alice Coltrane");
    expect(res.alternatives.map((a) => a.id)).toEqual(["plan-2", "plan-3"]);
  });

  it("dates the night on the next quiet slot in the venue's time zone", () => {
    const res = plan();
    expect(res.plan).toMatchObject({ date: "2026-10-29", start: "19:00", end: "22:00", createdAt: NOW.toISOString() });
    const moved = plan({ weekday: 5, start: "20:30", durationMin: 150 });
    expect(moved.plan).toMatchObject({ date: "2026-10-30", start: "20:30", end: "23:00" });
    expect(plan({ start: "25:99" }).plan.start).toBe("19:00");
  });

  it("respects avoid, prefer and no live music", () => {
    expect(plan({ noLiveMusic: true }).plan.format).not.toBe("listening");
    const noLive = plan({ noLiveMusic: true });
    expect([noLive.plan, ...noLive.alternatives].some((p) => p.format === "listening")).toBe(false);
    expect(noLive.plan.limits).toContain("Listening nights were left out because you asked for no live music.");
    expect(plan({}, { ...VENUE, noLiveMusic: true }).plan.format).not.toBe("listening");

    const avoid = plan({ avoidFormats: ["listening", "film"] });
    expect([avoid.plan, ...avoid.alternatives].map((p) => p.format)).not.toContain("film");
    expect(avoid.plan.limits).toContain("Left out at your request: listening nights and film nights.");

    expect(plan({ preferFormats: ["book"] }).plan.format).toBe("book");
    expect(plan({ preferFormats: ["tasting"] }).plan).toMatchObject({ format: "tasting", feature: null });
  });

  it("sizes the night and prefers formats that fit a small room", () => {
    const small = plan({ maxPeople: 8 });
    expect(small.plan.limits).toContain("Sized for up to 8 people.");
    expect(FORMATS[small.plan.format].people.min).toBeLessThanOrEqual(8);
  });

  it("throws when nothing can be built or everything was ruled out", () => {
    const empty: StreetRead = { ...read, rising: [], streetTags: [], venueTags: [], gaps: [] };
    expect(() => plan({}, VENUE, empty)).toThrow(PlanError);
    const onlyArtists: StreetRead = { ...read, rising: read.rising.filter((r) => r.type === "artist"), streetTags: [], venueTags: [], gaps: [] };
    const err = (() => {
      try {
        plan({ avoidFormats: ["listening", "quiz"] }, VENUE, onlyArtists);
      } catch (e) {
        return e as PlanError;
      }
      return null;
    })();
    expect(err?.code).toBe("all_avoided");
  });

  it("lets the gap pick the night when it matches a format: a Movie Theater gap makes it a film night", () => {
    const gap = read.gaps[0]!;
    const cinemaGap = { tag: { id: "urn:tag:category:place:movie_theater", name: "Movie Theater", namespace: "urn:tag:category:place", rank: 1 }, note: "3 of the 5 places nearby that Cafe Lumen's audience also loves are tagged Movie Theater.", because: gap.because };
    expect(plan({}, VENUE, { ...read, gaps: [] }).plan.format).toBe("listening");
    const film = plan({}, VENUE, { ...read, gaps: [cinemaGap] }).plan;
    expect(film.format).toBe("film");
    expect(film.why.map((b) => b.text)).toContain("A film night answers a gap the read found: 3 of the 5 places nearby that Cafe Lumen's audience also loves are tagged Movie Theater");
  });

  it("never ranks a pick from a list Qloo answered without the venue above one it tied to the venue", () => {
    const untied = read.rising.map((r) => (r.type === "movie" ? { ...r, rank: 1, venueSignal: false } : r));
    const res = plan({ preferFormats: ["film"] }, VENUE, { ...read, rising: untied });
    expect(res.plan.format).toBe("film");
    expect(res.plan.feature?.type).toBe("movie");
    const tiedShow = { ...read.rising.find((r) => r.type === "movie")!, id: "SHOW-1", name: "PEN15", type: "tv_show" as const, rank: 1, venueSignal: true };
    const mixed = plan({ preferFormats: ["film"] }, VENUE, { ...read, rising: [...untied, tiedShow] });
    expect(mixed.plan.feature?.name).toBe("PEN15");
  });

  it("offers only alternatives with a named Qloo pick and a real title", () => {
    const artistsOnly: StreetRead = { ...read, rising: read.rising.filter((r) => r.type === "artist") };
    const res = plan({}, VENUE, artistsOnly);
    expect(res.alternatives.length).toBeGreaterThan(0);
    for (const alt of res.alternatives) {
      expect(alt.format).not.toBe("tasting");
      expect(alt.feature?.name.trim()).toBeTruthy();
      expect(alt.copy.eventTitle.trim()).toBeTruthy();
    }
    const lone: StreetRead = { ...read, rising: read.rising.filter((r) => r.type === "artist").slice(0, 1) };
    const one = plan({ avoidFormats: ["quiz"] }, VENUE, lone);
    expect(one.plan.format).toBe("listening");
    expect(one.alternatives).toEqual([]);
    expect(one.plan.limits).toContain("No other kind of night had a Qloo pick to feature, so there are no alternatives.");
    expect(plan({ preferFormats: ["tasting"] }, VENUE, artistsOnly).plan).toMatchObject({ format: "tasting", feature: null });
  });

  it("never features a pick whose name came back blank", () => {
    const blank = read.rising.map((r, i) => (i === 0 ? { ...r, name: "  " } : r));
    const res = plan({}, VENUE, { ...read, rising: blank });
    for (const p of [res.plan, ...res.alternatives]) if (p.feature) expect(p.feature.name.trim()).not.toBe("");
  });

  it("never offers the same feature twice across the night and its alternatives", () => {
    const res = plan();
    const features = [res.plan, ...res.alternatives].map((p) => p.feature?.id).filter(Boolean);
    expect(new Set(features).size).toBe(features.length);
  });

  it("themes a night only with tags its feature carries, never book formats", () => {
    const res = plan({ preferFormats: ["book"] });
    const book = res.plan;
    const carried = new Set(book.feature?.tags ?? []);
    expect(book.themeTags.every((t) => carried.has(t.id))).toBe(true);
    const audiobook = { id: "urn:tag:keyword:media:audiobook", name: "Audiobook", namespace: "urn:tag:keyword:media", rank: 1 };
    const withFormat = read.rising.map((r) => (r.type === "book" ? { ...r, tags: [...(r.tags ?? []), audiobook.id] } : r));
    const again = plan({ preferFormats: ["book"] }, VENUE, { ...read, rising: withFormat, streetTags: [...read.streetTags, audiobook] }).plan;
    expect(again.themeTags.map((t) => t.name)).not.toContain("Audiobook");
  });

  it("fills copy from templates that pass the claim checker", () => {
    const res = plan();
    for (const p of [res.plan, ...res.alternatives]) {
      expect(p.copy.writtenBy).toBe("template");
      expect(p.checks).toEqual({ claimsVerified: true, unverified: [] });
      const text = Object.values(p.copy).flatMap((v) => (typeof v === "string" ? [v] : typeof v === "object" ? Object.values(v) : [])).join("\n");
      expect(checkClaims(text, briefNames(buildBrief(p, VENUE, read), p, read)).ok).toBe(true);
      expect(text).not.toMatch(/[\u2013\u2014]/);
      expect(p.copy.eventTitle.length).toBeLessThanOrEqual(60);
      expect(p.copy.posterHeadline.length).toBeLessThanOrEqual(40);
      expect(p.copy.social.length).toBeLessThanOrEqual(280);
    }
    expect(res.plan.copy.eventTitle).toBe("Alice Coltrane listening night at Cafe Lumen");
    expect(res.plan.copy.eventDescription).toContain("On Thursday 29 October from 19:00 to 22:00");
    expect(res.plan.copy.eventDescription).not.toContain("Blue Hour Wine Bar");
  });

  it("never points a reason at a missing provenance row", () => {
    const res = plan();
    for (const p of [res.plan, ...res.alternatives, plan({ preferFormats: ["tasting"] }).plan]) {
      const all = becauseOf(p);
      expect(all.length).toBeGreaterThan(0);
      for (const b of all) {
        expect(b.provenance, b.text).toBeGreaterThanOrEqual(0);
        expect(read.provenance[b.provenance], b.text).toBeDefined();
      }
    }
    const why = res.plan.why.map((b) => b.kind);
    expect(why).toEqual(expect.arrayContaining(["affinity", "explainability", "tag", "compare", "heatmap"]));
    expect(why).not.toContain("trending");
  });

  it("states what the plan rests on", () => {
    const p = plan().plan;
    expect(p.limits).toContain("Based on the street read from 2026-10-25.");
    expect(p.limits.some((l) => l.startsWith("Ranks are positions"))).toBe(true);
  });

  it("says so when there are no partners or menu ideas", () => {
    const noDishes = (t: { namespace: string }) => t.namespace !== "urn:tag:specialty_dish:place";
    const bare: StreetRead = { ...read, lovedPlaces: [], streetTags: read.streetTags.filter(noDishes), venueTags: read.venueTags.filter(noDishes) };
    const p = plan({}, VENUE, bare).plan;
    expect(p.partners).toEqual([]);
    expect(p.limits).toContain("No place within a 1 km walk came back from Qloo, so this night has no partners.");
    expect(p.limits).toContain("Qloo returned no food or drink tags for your audience or the street, so there are no menu ideas.");
  });
});
