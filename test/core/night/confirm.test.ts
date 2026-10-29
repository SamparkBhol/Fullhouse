import { describe, expect, it } from "vitest";
import { confirmPartnerStop } from "../../../src/core/night/confirm.ts";
import { sharedPicks } from "../../../src/core/night/build.ts";
import { shortTitle } from "../../../src/core/copy/text.ts";
import { likedFor } from "../../../src/core/pair/taste.ts";
import { plainName, shortName } from "../../../src/shared/words.ts";
import { liveNight, plan } from "./live.ts";

const hw = liveNight("night2_hw_angelika");

describe("the partner's own stop", () => {
  const r = plan(hw);
  const at = "2026-10-29T20:00:00.000Z";

  it("takes the partner's time and words, keeps the stop's length, and writes the copy again", () => {
    const next = confirmPartnerStop(r.plan, { start: "19:45", what: "Our 19:45 screening of Beautiful Boy, tickets at the door", tellsRegulars: true, at }, hw.venue);
    const stop = next.pair?.stops.find((s) => s.at === "partner");
    expect(stop).toMatchObject({ start: "19:45", end: "22:00", what: "Our 19:45 screening of Beautiful Boy, tickets at the door" });
    expect(next.end).toBe("22:00");
    expect(next.copy.eventDescription).toContain("19:45 to 22:00");
    expect(next.copy.eventDescription).not.toContain("19:15 to 21:30");
    expect(next.copy.writtenBy).toBe("template");
  });

  it("drops the hours caveat when the partner says it is open, and changes nothing when nothing was typed", () => {
    const open = confirmPartnerStop(r.plan, { tellsRegulars: false, open: true, at }, hw.venue);
    expect(open.day?.note).not.toMatch(/lists no opening hours/);
    expect(open.limits.some((l) => /lists no opening hours/.test(l))).toBe(false);
    expect(open.copy).toEqual(r.plan.copy);
    const same = confirmPartnerStop(r.plan, { tellsRegulars: true, at }, hw.venue);
    expect(same.pair?.stops).toEqual(r.plan.pair?.stops);
  });

  it("keeps words the owner already edited", () => {
    const edited = { ...r.plan, copy: { ...r.plan.copy, eventTitle: "Our night", editedByOwner: true } };
    const next = confirmPartnerStop(edited, { start: "20:00", tellsRegulars: true, at }, hw.venue);
    expect(next.copy.eventTitle).toBe("Our night");
    expect(next.pair?.stops[1]?.start).toBe("20:00");
  });
});

describe("what both crowds share when tags are thin", () => {
  it("names the titles both crowds put in their top ten, films first for a book then film night", () => {
    const v = { id: hw.venue.entity.id, name: hw.venue.entity.name };
    const p = { id: hw.match.partner.id, name: hw.match.partner.name };
    const picks = sharedPicks(hw.joint, v, p, ["book", "movie"]);
    expect(picks?.type).toBe("book");
    expect(picks?.names.length).toBeGreaterThanOrEqual(2);
    expect(plan(hw).plan.match?.sharedPicks).toEqual(picks);
  });
});

describe("names and titles", () => {
  it("strips flags and pipe tails from a listing name", () => {
    expect(shortName("Ousia | Charlotte Street \u{1F1EC}\u{1F1F7}")).toBe("Ousia");
    expect(plainName("K-POP \u{1F1F0}\u{1F1F7}")).toBe("K-POP");
    expect(shortName("Angelika Film Center & Cafe, New York")).toBe("Angelika Film Center");
  });

  it("keeps a numbered part in a short title", () => {
    expect(shortTitle("Dune: Part Two")).toBe("Dune: Part Two");
    expect(shortTitle("Walden: Or, Life in the Woods")).toBe("Walden");
    expect(shortTitle("Hunger: A Memoir of (My) Body")).toBe("Hunger");
  });
});

describe("what a venue is liked for", () => {
  it("drops menu items, service words and tags most of the street carries, rarest first, five at most", () => {
    const tag = (ns: string, name: string, rank: number) => ({ id: `urn:tag:${ns}:${name.replace(/ /g, "_")}`, name, namespace: `urn:tag:${ns}`, rank });
    const venueTags = [tag("specialty_dish:place", "Fries", 1), tag("interests:qloo", "Folk", 2), tag("ambience:qloo", "Trendy", 3), tag("interests:qloo", "Queer lit", 4), tag("genre:media", "Young adult", 5), tag("interests:qloo", "Literary", 6), tag("ambience:qloo", "Intimate", 7)];
    const street = Array.from({ length: 10 }, (_, i) => ({ tags: [i < 8 ? "urn:tag:ambience:qloo:Trendy" : "", i < 2 ? "urn:tag:interests:qloo:Literary" : "", "urn:tag:interests:qloo:Folk"].filter(Boolean) }));
    const liked = likedFor(venueTags, street);
    expect(liked.map((t) => t.name)).toEqual(["Intimate", "Literary"]);
    expect(liked[1]).toMatchObject({ carriers: 2, pool: 10 });
  });
});
