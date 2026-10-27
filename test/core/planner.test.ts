import { beforeAll, describe, expect, it } from "vitest";
import {
  FORMATS,
  PLAYLIST_LICENCE,
  PlanError,
  WALK_M,
  checkClaims,
  createQloo,
  planNights,
  readStreet,
  briefNames,
  buildBrief,
} from "../../src/core/index.ts";
import type { Because, NightPlan, PlanResponse, StreetRead } from "../../src/shared/contract.ts";
import { NOW, VENUE, fakeFetch, streetRoute } from "../fixtures/street.ts";

let read: StreetRead;

function ids() {
  let n = 0;
  return () => `plan-${++n}`;
}

function plan(input = {}, venue = VENUE, r = read): PlanResponse {
  return planNights(r, venue, input, NOW, "owner", ids());
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
  const f = fakeFetch([streetRoute]);
  read = await readStreet(createQloo({ apiKey: "k", fetch: f.fetch, now: () => NOW }), VENUE);
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
    const empty: StreetRead = { ...read, rising: [], streetTags: [] };
    expect(() => plan({}, VENUE, empty)).toThrow(PlanError);
    const onlyArtists: StreetRead = { ...read, rising: read.rising.filter((r) => r.type === "artist"), streetTags: [] };
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

  it("picks partners within walking distance that share the theme and are not direct competitors", () => {
    for (const p of [plan().plan, ...plan().alternatives]) {
      expect(p.partners.length).toBeGreaterThanOrEqual(2);
      expect(p.partners.length).toBeLessThanOrEqual(3);
      for (const x of p.partners) {
        expect(x.distanceM).toBeLessThanOrEqual(WALK_M);
        expect(x.tags).not.toContain("urn:tag:genre:place:cafe");
      }
      expect(p.partners.map((x) => x.name)).not.toContain("Daybreak Cafe");
    }
    const listening = plan().plan;
    expect(listening.partners[0]?.name).toBe("Blue Hour Wine Bar");
    expect(listening.partners[0]?.because.at(-1)?.text).toContain("tagged Wine Bar, which Full House pairs with a listening night");
    const book = plan({ preferFormats: ["book"] }).plan;
    expect(book.partners.map((x) => x.name)).toContain("Kettle Books");
    const tasting = plan({ preferFormats: ["tasting"] }).plan;
    expect(tasting.partners[0]?.because.at(-1)?.text).toContain("which is part of this night's theme");
    expect(listening.partners[0]?.because.at(-1)?.text).toMatch(/^About \d+ m from Cafe Lumen, tagged /);
  });

  it("takes menu ideas only from street tags", () => {
    const street = new Map(read.streetTags.map((t) => [t.name, t]));
    const p = plan().plan;
    expect(p.menuIdeas.map((m) => m.text)).toEqual(["Add natural wine to the menu for the night", "Add Japanese food to the menu for the night"]);
    for (const m of p.menuIdeas) {
      const name = m.because[0]?.text.match(/^The street ranks (.+) #\d+/)?.[1] ?? "";
      expect(street.has(name)).toBe(true);
      expect(read.provenance[m.because[0]!.provenance]?.call).toBe("street_tags");
    }
    const tasting = plan({ preferFormats: ["tasting"] }).plan;
    expect(tasting.themeTags[0]?.name).toBe("Natural Wine");
    expect(tasting.copy.eventTitle).toBe("Natural wine tasting night at Cafe Lumen");
    expect(tasting.copy.eventDescription).toContain("On the menu: natural wine and Japanese food.");
  });

  it("builds the playlist only from the street's artist results, with the licence note", () => {
    const p = plan({ preferFormats: ["film"] }).plan;
    const artists = read.rising.filter((r) => r.type === "artist").map((r) => r.id);
    expect(p.playlist.map((a) => a.id)).toEqual(artists);
    expect(p.playlist.every((a) => a.type === "artist")).toBe(true);
    expect(p.limits).toContain(PLAYLIST_LICENCE);
    expect(p.limits).toContain(FORMATS.film.licence);
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
    expect(why).toEqual(expect.arrayContaining(["affinity", "trending", "tag", "compare", "heatmap"]));
  });

  it("states what the plan rests on", () => {
    const p = plan().plan;
    expect(p.limits).toContain("Based on the street read from 2026-10-25.");
    expect(p.limits.some((l) => l.startsWith("Ranks are positions"))).toBe(true);
  });

  it("says so when there are no partners or menu ideas", () => {
    const bare: StreetRead = { ...read, lovedPlaces: [], streetTags: read.streetTags.filter((t) => !t.namespace.includes("cuisine") && !t.namespace.includes("menu")) };
    const p = plan({}, VENUE, bare).plan;
    expect(p.partners).toEqual([]);
    expect(p.limits).toContain("No place within a 1 km walk came back from Qloo, so this night has no partners.");
    expect(p.limits).toContain("Qloo returned no food or drink tags for this street, so there are no menu ideas.");
  });
});
