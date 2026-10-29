import { beforeAll, describe, expect, it } from "vitest";
import { FORMATS, PLAYLIST_LICENCE, WALK_M } from "../../src/core/index.ts";
import type { PlanInput, PlanResponse, StreetRead } from "../../src/shared/contract.ts";
import { VENUE } from "../fixtures/street.ts";
import { fixtureRead, planFrom } from "./plan_setup.ts";

let read: StreetRead;

function plan(input: PlanInput = {}, venue = VENUE, r = read): PlanResponse {
  return planFrom(r, input, venue);
}

beforeAll(async () => {
  read = await fixtureRead();
});

describe("partners, menu ideas and the playlist", () => {
  it("picks partners within walking distance that share the theme and are not direct competitors", () => {
    for (const p of [plan().plan, ...plan().alternatives]) {
      expect(p.partners.length).toBeGreaterThanOrEqual(1);
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
    expect(listening.format).toBe("listening");
    expect(listening.partners.map((x) => x.name)).not.toContain("Grand Street Cinema");
    const book = plan({ preferFormats: ["book"] }).plan;
    expect(book.partners.map((x) => x.name)).toContain("Kettle Books");
    const tasting = plan({ preferFormats: ["tasting"] }).plan;
    expect(tasting.partners[0]?.because.at(-1)?.text).toContain("which is part of this night's theme");
    expect(listening.partners[0]?.because.at(-1)?.text).toMatch(/^About \d+ m from Cafe Lumen, tagged /);
  });

  it("does not pick a partner only because it shares a tag the venue already has", () => {
    const shared = VENUE.entity.tags.find((t) => read.lovedPlaces.some((p) => p.tags.includes(t)));
    expect(shared).toBeDefined();
    const office = { ...read.lovedPlaces[0]!, id: "OFFICE-1", name: "Sutter Office Tower", rank: read.lovedPlaces.length + 1, distanceM: 200, tags: [shared!] };
    const withOffice: StreetRead = { ...read, lovedPlaces: [...read.lovedPlaces, office] };
    expect(plan({}, VENUE, withOffice).plan.partners.map((x) => x.name)).not.toContain("Sutter Office Tower");
  });

  it("fills partners only with businesses that have a website, never landmarks", () => {
    const { url: _website, ...first } = read.lovedPlaces[0]!;
    const shop = { ...first, id: "SHOP-1", name: "Lantern Print Shop", rank: 1, distanceM: 30, tags: ["urn:tag:category:place:print_shop"] };
    const tower = { ...read.lovedPlaces[0]!, id: "TOWER-1", name: "Lantern Tower", rank: 2, distanceM: 40, tags: ["urn:tag:category:place:historical_landmark"] };
    expect(plan({}, VENUE, { ...read, lovedPlaces: [shop, tower] }).plan.partners).toEqual([]);
  });

  it("leads menu ideas with the venue's own food tags, then the street's, one per dish", () => {
    const p = plan().plan;
    expect(p.menuIdeas.map((m) => m.text)).toEqual([
      "Add espresso to the menu for the night",
      "Add natural wine to the menu for the night",
      "Add ramen to the menu for the night",
    ]);
    expect(p.menuIdeas[0]?.because[0]?.text).toBe("1st among the food tags for people who like Cafe Lumen");
    expect(read.provenance[p.menuIdeas[0]!.because[0]!.provenance]?.call).toBe("venue_tags");
    expect(p.menuIdeas[2]?.because[0]?.text).toBe("Ramen is among the taste tags Qloo returns for the area around Cafe Lumen");
    expect(read.provenance[p.menuIdeas[2]!.because[0]!.provenance]?.call).toBe("street_tags");
    const tasting = plan({ preferFormats: ["tasting"] }).plan;
    expect(tasting.themeTags.map((t) => t.name)).toEqual(["Wine", "Espresso", "Natural Wine"]);
    expect(tasting.menuIdeas[0]).toMatchObject({ text: "Add wine to the menu for the night", because: [{ kind: "compare" }] });
    expect(tasting.copy.eventTitle).toBe("Wine tasting night at Cafe Lumen");
    expect(tasting.copy.eventDescription).toContain("On the menu: wine, espresso and natural wine.");
  });

  it("drops partners Qloo lists as closed for the night and shows the hours of the rest", () => {
    const listening = plan().plan;
    expect(listening.partners[0]?.because.map((b) => b.text)).toContain("Open Thursdays 17:00 to 23:30, by its listing");
    const closedTonight = read.lovedPlaces.map((p) => (p.name === "Blue Hour Wine Bar" ? { ...p, hours: { thursday: [{ closed: true }] } } : p));
    const res = plan({}, VENUE, { ...read, lovedPlaces: closedTonight }).plan;
    expect(res.partners.map((p) => p.name)).not.toContain("Blue Hour Wine Bar");
    expect(res.limits).toContain("1 nearby place is left out because Qloo lists it as closed by the start of the night.");
    const shutEarly = read.lovedPlaces.map((p) => (p.name === "Kettle Books" ? { ...p, hours: { thursday: [{ opens: "10:00", closes: "18:00" }] } } : p));
    expect(plan({ preferFormats: ["book"] }, VENUE, { ...read, lovedPlaces: shutEarly }).plan.partners.map((p) => p.name)).not.toContain("Kettle Books");
    const noHours = plan().plan.partners.find((p) => !p.hours);
    if (noHours) expect(noHours.because.map((b) => b.text)).toContain(`${noHours.name} has no opening hours listed, so check before you send`);
  });

  it("builds the playlist only from the street's artist results, with the licence note", () => {
    const p = plan({ preferFormats: ["film"] }, { ...VENUE, entity: { ...VENUE.entity, tags: ["urn:tag:genre:place:movie_theater"] } }).plan;
    const artists = read.rising.filter((r) => r.type === "artist").map((r) => r.id);
    expect(p.playlist.map((a) => a.id)).toEqual(artists);
    expect(p.playlist.every((a) => a.type === "artist")).toBe(true);
    expect(p.limits).toContain(PLAYLIST_LICENCE);
    expect(p.limits).toContain(FORMATS.film.licence);
  });
});
