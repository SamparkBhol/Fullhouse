import { describe, expect, it } from "vitest";
import { jointTypes, pairFormat, plainTwoStop } from "../../../src/core/night/grammar.ts";
import type { KindGroup } from "../../../src/shared/contract.ts";

const GROUPS: Array<KindGroup | null> = ["book", "film", "record", "live", "drinks", "coffee", "food", "art", "stage", null];

describe("the format grammar", () => {
  it("takes the first row that matches the two kinds of place", () => {
    expect(pairFormat("book", "film").format).toBe("book_then_film");
    expect(pairFormat("film", "book").format).toBe("book_then_film");
    expect(pairFormat("film", "stage")).toMatchObject({ format: "film_then_show", label: "film then show", opens: "film", main: "screening", other: "show" });
    for (const g of ["drinks", "food", "coffee"] as const) expect(pairFormat("film", g).format).toBe("screening_then_drinks");
    for (const g of ["coffee", "drinks", "food", "stage"] as const) expect(pairFormat(g, "book").format).toBe("book_club_then_drinks");
    for (const g of ["drinks", "art", "stage", "coffee", "live", null] as const) expect(pairFormat("record", g).format).toBe("listening_party");
    expect(pairFormat("live", "coffee")).toMatchObject({ format: "drinks_then_set", label: "coffee then the set", opens: "coffee", main: "coffee", other: "set" });
    expect(pairFormat("drinks", "live")).toMatchObject({ format: "drinks_then_set", label: "drinks then the set", opens: "drinks" });
    expect(pairFormat("live", "film")).toMatchObject({ format: "film_then_show", label: "film then the set" });
    expect(pairFormat("live", "book")).toMatchObject({ format: "book_club_then_drinks", label: "book club then the set" });
    expect(pairFormat("live", null)).toMatchObject({ format: "drinks_then_set", other: "set" });
    for (const g of ["drinks", "food", "coffee"] as const) expect(pairFormat("stage", g).format).toBe("show_then_drinks");
    for (const g of ["drinks", "coffee", "food", "film", "book", null] as const) expect(pairFormat("art", g).format).toBe("late_view");
    expect(pairFormat("coffee", "drinks")).toMatchObject({ format: "quiz_crawl", label: "quiz crawl", opens: null });
    expect(pairFormat("food", "drinks")).toMatchObject({ format: "quiz_crawl", label: "dinner then quiz", opens: "food", main: "dinner", other: "quiz" });
    expect(pairFormat(null, null).format).toBe("two_stop");
  });

  it("keeps a live room's own set and never plays a playlist over it", () => {
    const def = pairFormat("live", "drinks");
    expect(def.types).toEqual([]);
    expect(def.music).toBe(true);
    expect(plainTwoStop("food", "drinks")).toMatchObject({ format: "two_stop", label: "dinner then drinks", opens: "food", main: "dinner", other: "drinks" });
  });

  it("names the night after both of its parts", () => {
    expect(pairFormat("book", "coffee").label).toBe("book club then coffee");
    expect(pairFormat("book", "stage").label).toBe("book club then the show");
    expect(pairFormat("stage", "food").label).toBe("show then dinner");
    expect(pairFormat("art", "film").label).toBe("late view then a film");
  });

  it("never falls back to two stops while a book, a film, a show, a record shop or a gallery is one of the two", () => {
    for (const a of GROUPS) {
      for (const b of GROUPS) {
        if (a === b && a !== null) continue;
        const def = pairFormat(a, b);
        if ([a, b].some((g) => g !== null && ["book", "film", "stage", "record", "live", "art"].includes(g))) expect(def.format, `${a} ${b}`).not.toBe("two_stop");
      }
    }
  });

  it("never shows a TV show to a room: TV only themes a quiz, and films are screened only with a cinema", () => {
    for (const a of GROUPS) {
      for (const b of GROUPS) {
        const def = pairFormat(a, b);
        if (def.types.includes("tv_show")) expect(def.format, `${a} ${b}`).toBe("quiz_crawl");
        if ([def.main, def.other].includes("screening")) expect([a, b], `${a} ${b}`).toContain("film");
      }
    }
  });

  it("asks Qloo only for the types the format uses, and for artists only when a bar, music room or cafe can play them", () => {
    expect(jointTypes(pairFormat("book", "film"))).toEqual(["book", "movie"]);
    expect(jointTypes(pairFormat("film", "stage"))).toEqual(["movie"]);
    expect(jointTypes(pairFormat("coffee", "drinks"))).toEqual(["tv_show", "movie", "artist"]);
    expect(jointTypes(pairFormat("book", "coffee"))).toEqual(["book", "artist"]);
    expect(jointTypes(pairFormat("record", "drinks"))).toEqual(["artist"]);
    expect(jointTypes(pairFormat("live", "coffee"))).toEqual(["artist"]);
    expect(jointTypes(pairFormat("live", "film"))).toEqual(["movie"]);
    expect(jointTypes(pairFormat("art", "film"))).toEqual(["movie"]);
  });
});
