import { describe, expect, it } from "vitest";
import { complement, groupOf, kindOf, rivals, UNLISTED_PAIR } from "../../../src/core/pair/groups.ts";
import type { KindGroup } from "../../../src/shared/contract.ts";
import { HOUSING_WORKS, REGGIO, livePlaces, placeNamed } from "./live.ts";

const reggioPlaces = livePlaces("reggio_loved");
const hwPlaces = livePlaces("hw_loved");

// The live listing name, with its spaced hyphen built from parts.
const ANGELIKA = ["Angelika Film Center & Cafe", "New York"].join(" \u002d ");

describe("kind groups from Qloo's kind tags", () => {
  it("files each real place under the kind that says most about it", () => {
    expect(kindOf(REGGIO().entity)).toMatchObject({ group: "coffee", word: "cafe" });
    expect(kindOf(HOUSING_WORKS().entity)).toMatchObject({ group: "book", word: "bookshop", part: "book_store" });
    expect(kindOf(placeNamed(hwPlaces, ANGELIKA))).toMatchObject({ group: "film", word: "cinema" });
    expect(kindOf(placeNamed(reggioPlaces, "Veselka"))).toMatchObject({ group: "food", word: "restaurant" });
    expect(kindOf(placeNamed(reggioPlaces, "Olive Tree Cafe"))).toMatchObject({ group: "drinks", word: "bar" });
    expect(kindOf(placeNamed(reggioPlaces, "Mezzrow"))).toMatchObject({ group: "live", word: "jazz club" });
    expect(kindOf(placeNamed(reggioPlaces, "Strand Bookstore"))).toMatchObject({ group: "book", word: "bookshop" });
  });

  it("files a record shop that also sells books as a record shop, and a used bookshop with records under books", () => {
    const k = (...parts: string[]) => ({ tags: parts.map((x) => `urn:tag:category:place:${x}`) });
    expect(kindOf(k("live_music_venue", "book_store", "music_store", "record_store"))).toMatchObject({ group: "record", word: "record shop" });
    expect(kindOf(k("book_store", "record_store"))).toMatchObject({ group: "record", word: "record shop" });
    expect(kindOf(k("book_store", "record_store", "used_book_store"))).toMatchObject({ group: "book", word: "bookshop" });
    expect(kindOf(k("jazz_club", "bar"))).toMatchObject({ group: "live", word: "jazz club" });
  });

  it("calls an arts centre with its own gallery a gallery's rival, and keeps a cinema with a cafe apart from a bookshop", () => {
    const k = (...parts: string[]) => ({ tags: parts.map((x) => `urn:tag:category:place:${x}`) });
    const gallery = k("art_gallery");
    const ica = k("book_store", "art_gallery", "movie_theater", "bar", "performing_arts_theater");
    expect(rivals(ica, gallery)).toBe(true);
    expect(rivals(gallery, ica)).toBe(true);
    expect(rivals(placeNamed(hwPlaces, ANGELIKA), HOUSING_WORKS().entity)).toBe(false);
  });

  it("calls two cafes rivals, and a cafe and a bar not", () => {
    expect(rivals(placeNamed(reggioPlaces, "Think Coffee"), REGGIO().entity)).toBe(true);
    expect(rivals(placeNamed(reggioPlaces, "Olive Tree Cafe"), REGGIO().entity)).toBe(false);
    expect(groupOf({ tags: ["urn:tag:genre:place:juice_bar"] })).toBe("coffee");
    expect(groupOf({ tags: ["urn:tag:genre:place:sushi_bar"] })).toBe("food");
    expect(groupOf({ tags: ["urn:tag:genre:place:dive_bar"] })).toBe("drinks");
  });
});

describe("the complement matrix", () => {
  const listed: Array<[KindGroup, KindGroup, number]> = [
    ["book", "film", 1], ["book", "coffee", 1], ["book", "drinks", 0.8], ["film", "drinks", 1], ["film", "food", 0.9],
    ["record", "drinks", 1], ["record", "coffee", 0.8], ["live", "drinks", 1], ["live", "coffee", 0.9], ["coffee", "drinks", 0.7], ["food", "drinks", 0.9], ["art", "drinks", 0.9],
    ["art", "coffee", 0.8], ["stage", "drinks", 1], ["stage", "food", 0.9], ["coffee", "food", 0.5],
    ["film", "stage", 0.8], ["art", "film", 0.8],
  ];

  it("holds the agreed values both ways round", () => {
    for (const [a, b, v] of listed) {
      expect(complement(a, b), `${a} ${b}`).toBe(v);
      expect(complement(b, a), `${b} ${a}`).toBe(v);
    }
  });

  it("gives the same group nothing and an unlisted pair one half", () => {
    expect(complement("coffee", "coffee")).toBe(0);
    expect(complement("book", "stage")).toBe(UNLISTED_PAIR);
    expect(complement(null, "book")).toBe(UNLISTED_PAIR);
  });
});
