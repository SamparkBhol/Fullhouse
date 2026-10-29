import { describe, expect, it } from "vitest";
import { canHost, foodLed } from "../../src/core/street/hosts.ts";
import { pairCandidates } from "../../src/core/pair/candidates.ts";
import { rivals } from "../../src/core/pair/groups.ts";
import type { LovedPlace } from "../../src/shared/contract.ts";
import { VENUE } from "../fixtures/street.ts";

const kinds = (...k: string[]) => k.map((x) => `urn:tag:genre:place:${x}`);

function place(name: string, tags: string[], rank = 1, url: string | undefined = "https://x.example"): LovedPlace {
  return { id: name.toUpperCase().replace(/\W+/g, "-"), name, type: "place", lat: 0, lng: 0, distanceM: 200, rank, tags, because: [], ...(url ? { url } : {}) };
}

// Kind tags as Qloo returned them for the places near Housing Works Bookstore Cafe on 27 October 2026.
const ANGELIKA = place("Angelika Film Center", kinds("tourist_attraction", "cafe", "event_venue", "restaurant:cafe", "restaurant", "movie_theater"));
const LIBRARY = place("Elmer Holmes Bobst Library", kinds("university_library"));
const CHURCH = place("The Basilica of St. Patrick's Old Cathedral", kinds("catholic_church", "place_of_worship", "tourist_attraction", "event_venue"));
const PARK = place("Washington Square Park", kinds("city_park", "park", "tourist_attraction"));
const GARDEN = place("Liz Christy Garden", kinds("community_garden", "garden", "tourist_attraction"));
const COLLEGE = place("Parsons School of Design", kinds("college"));
const STAMPS = place("Casey Rubber Stamps", kinds("rubber_stamp_store"));
const MUSEUM = place("Tenement Museum", kinds("museum", "tourist_attraction", "history_museum"));
const BOOKS = place("Mercer Street Books & Records", kinds("shopping", "book_store", "record_store", "used_book_store"));
const GALLERY = place("Soho Photo Gallery", kinds("art_gallery", "non_profit_organization", "tourist_attraction"));
const IFC = place("IFC Center", kinds("movie_theater"));

describe("places that can host a night", () => {
  it("are cinemas, bookshops, record shops, galleries, cafes and bars, even when Qloo also calls them a tourist attraction", () => {
    for (const p of [ANGELIKA, BOOKS, GALLERY, IFC, place("Bar", kinds("bar", "cocktail_bar")), place("Trattoria", kinds("restaurant:italian", "italian_restaurant"))]) expect(canHost(p), p.name).toBe(true);
  });

  it("are never libraries, churches, parks, gardens, universities, museums or shops that cannot host", () => {
    for (const p of [LIBRARY, CHURCH, PARK, GARDEN, COLLEGE, STAMPS, MUSEUM]) expect(canHost(p), p.name).toBe(false);
  });

  it("need a website, so there is someone to ask", () => {
    const { url: _url, ...noSite } = place("No site cinema", kinds("movie_theater"));
    expect(canHost(noSite)).toBe(false);
  });

  it("leave a takeout counter out", () => {
    expect(canHost(place("Slice", kinds("pizza_takeout", "takeout_restaurant")))).toBe(false);
  });
});

describe("the match candidates", () => {
  const bookshop = { entity: { ...VENUE.entity, tags: kinds("restaurant", "event_venue", "restaurant:cafe", "book_store", "cafe", "tourist_attraction") } };

  it("drop places that cannot host and the venue's rivals, and keep Qloo's order", () => {
    const loved = [place("Angelika", ANGELIKA.tags, 1), { ...LIBRARY, rank: 2 }, { ...BOOKS, rank: 3 }, { ...IFC, rank: 4 }, { ...CHURCH, rank: 5 }, { ...GALLERY, rank: 6 }];
    expect(pairCandidates(loved, bookshop).map((p) => p.name)).toEqual(["Angelika", "IFC Center", "Soho Photo Gallery"]);
    expect(rivals(BOOKS, bookshop.entity)).toBe(true);
    expect(rivals(ANGELIKA, bookshop.entity)).toBe(false);
  });

  it("call two plain cafes rivals, and a cafe and a cinema not", () => {
    const cafe = { entity: { ...VENUE.entity, tags: kinds("restaurant:cafe", "cafe", "restaurant") } };
    expect(rivals(place("Other cafe", kinds("cafe", "restaurant:cafe")), cafe.entity)).toBe(true);
    expect(rivals(ANGELIKA, cafe.entity)).toBe(false);
  });

  it("stop at eight", () => {
    const many = Array.from({ length: 12 }, (_, i) => place(`Cinema ${i + 1}`, kinds("movie_theater"), i + 1));
    expect(pairCandidates(many, bookshop).map((p) => p.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("food led venues", () => {
  it("are cafes and restaurants Qloo files for nothing more defining than food", () => {
    expect(foodLed({ tags: kinds("restaurant:cafe", "cafe", "restaurant") })).toBe(true);
    expect(foodLed({ tags: kinds("restaurant", "event_venue", "restaurant:cafe", "book_store", "cafe") })).toBe(false);
    expect(foodLed({ tags: ANGELIKA.tags })).toBe(false);
    expect(foodLed({ tags: ["record shop"] })).toBe(false);
  });
});
