import { describe, expect, it } from "vitest";
import { bookKind, bundle } from "../../../src/core/night/books.ts";
import { linkLine } from "../../../src/core/night/connect.ts";
import { playlistStops } from "../../../src/core/night/music.ts";
import { phrase } from "../../../src/core/night/voice.ts";
import { fastFood } from "../../../src/core/street/hosts.ts";
import type { NightStop } from "../../../src/shared/contract.ts";
import { shortName, theTitle } from "../../../src/shared/words.ts";

describe("plain names and one article", () => {
  it("says a place's name the way people say it", () => {
    expect(shortName(["Angelika Film Center & Cafe", "New York"].join(" - "))).toBe("Angelika Film Center");
    expect(shortName("City Lights Booksellers & Publishers")).toBe("City Lights Booksellers");
    expect(shortName("Joe's Pizza, Hollywood Blvd")).toBe("Joe's Pizza");
    expect(shortName("Bar & Cafe")).toBe("Bar & Cafe");
  });

  it("never doubles an article in front of a title", () => {
    expect(theTitle("The Possession of Mr Cave")).toBe("The Possession of Mr Cave");
    expect(theTitle("Hunger")).toBe("the Hunger");
    expect(phrase("Book club on Hunger by Roxane Gay")).toBe("the book club on Hunger by Roxane Gay");
    expect(phrase("Drinks after")).toBe("drinks");
    expect(phrase("Soho Theatre's own show that night")).toBe("Soho Theatre's own show that night");
  });
});

describe("what ties a book to a film", () => {
  it("says it the way a person would, and claims nothing when nothing is shared", () => {
    expect(linkLine({ score: 2, themes: ["grief"], genre: "coming_of_age", setting: "New York", form: false })).toBe("Both are coming of age stories about grief, set in New York.");
    expect(linkLine({ score: 2, themes: ["addiction"], genre: null, setting: null, form: true })).toBe("Both are true stories about addiction.");
    expect(linkLine({ score: 1, themes: [], genre: null, setting: "London", form: false })).toBe("The book and the film are both set in London.");
    expect(linkLine({ score: 0, themes: [], genre: null, setting: null, form: false })).toBeNull();
  });
});

describe("books a club can read", () => {
  const g = (...labels: string[]) => ({ tags: labels.map((l) => `urn:tag:genre:media:${l}`) });

  it("tells a story, a life or essays from a textbook when Qloo's genres say so", () => {
    expect(bookKind(g("memoir", "nonfiction"))).toBe("story");
    expect(bookKind(g("literary_fiction"))).toBe("story");
    expect(bookKind(g("education", "sociology", "nonfiction"))).toBe("homework");
    expect(bookKind(g("nonfiction", "history"))).toBe("other");
  });

  it("knows a box set and two titles joined with a slash", () => {
    expect(bundle("Circe / The Song of Achilles")).toBe(true);
    expect(bundle("A Court of Thorns and Roses Box Set")).toBe(true);
    expect(bundle("The Possession of Mr Cave")).toBe(false);
  });
});

describe("where the playlist plays", () => {
  const stop = (at: NightStop["at"], start: string): NightStop => ({ at, placeId: at, name: at, start, end: "23:00", what: "x" });

  it("in a bar or a music room, and in a cafe only once it is evening", () => {
    const sides = [
      { at: "venue" as const, group: "coffee" as const, place: { id: "v", name: "Cafe", tags: [] } },
      { at: "partner" as const, group: "book" as const, place: { id: "p", name: "Shop", tags: [] } },
    ];
    expect(playlistStops([stop("venue", "19:00"), stop("partner", "20:15")], sides)).toEqual(["venue"]);
    expect(playlistStops([stop("venue", "16:00"), stop("partner", "17:15")], sides)).toEqual([]);
  });
});

describe("rooms a night can use", () => {
  it("leaves out a fast food chain, and keeps an espresso bar Qloo also files as fast food", () => {
    expect(fastFood({ tags: ["urn:tag:category:place:fast_food_restaurant", "urn:tag:genre:place:restaurant:fast_food", "urn:tag:culinary_style:qloo:fast_food"] })).toBe(true);
    expect(fastFood({ tags: ["urn:tag:category:place:fast_food_restaurant", "urn:tag:category:place:espresso_bar", "urn:tag:category:place:cafe"] })).toBe(false);
  });
});
