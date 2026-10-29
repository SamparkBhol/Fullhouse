import { describe, expect, it } from "vitest";
import { namedLike, sharedWords } from "../../../src/core/street/search_rank.ts";

const kinds = (...parts: string[]) => parts.map((p) => `urn:tag:category:place:${p}`);
const row = (name: string, ...parts: string[]) => ({ name, tags: kinds(...parts) });

describe("search results whose names have nothing to do with what was typed", () => {
  it("drops the KFC and the patisserie on Prince Charles Drive once the cinema itself came back", () => {
    const rows = [row("Prince Charles Cinema", "movie_theater"), row("Patisserie Valerie, Brent Cross Fenwick", "cafe"), row("KFC Brent Cross, Shopping Centre", "restaurant")];
    expect(namedLike(rows, "prince charles cinema").map((r) => r.name)).toEqual(["Prince Charles Cinema"]);
  });

  it("keeps only names with every typed word when one has them all, so City Lights loses Cow Palace and Daly City", () => {
    const rows = [row("City Lights Booksellers & Publishers", "book_store"), row("Cow Palace Arena & Event Center", "concert_hall"), row("Cinemark Century Daly City 20 XD and IMAX", "movie_theater")];
    expect(namedLike(rows, "city lights").map((r) => r.name)).toEqual(["City Lights Booksellers & Publishers"]);
  });

  it("drops a garage door company that shares the name once a place that can host came back", () => {
    const rows = [row("Caffe Reggio", "cafe"), row("Reggio Garage Door Co., Inc.", "garage_door_supplier")];
    expect(namedLike(rows, "reggio").map((r) => r.name)).toEqual(["Caffe Reggio"]);
  });

  it("drops the cafes that share only the word cafe once Housing Works itself came back", () => {
    const rows = [row("Housing Works Bookstore", "book_store", "cafe"), row("Ferrara Bakery & Cafe", "cafe"), row("The River Caf\u00e9", "restaurant"), row("Russ & Daughters Cafe", "cafe")];
    expect(namedLike(rows, "housing works bookstore cafe").map((r) => r.name)).toEqual(["Housing Works Bookstore"]);
  });

  it("keeps every cafe when only the kind was typed", () => {
    const rows = [row("Cafe Wha?", "cafe"), row("Cafe Cluny", "cafe")];
    expect(namedLike(rows, "cafe").map((r) => r.name)).toEqual(["Cafe Wha?", "Cafe Cluny"]);
  });

  it("keeps the near matches when no name has every word, and everything when no name shares one", () => {
    const rows = [row("Housing Works Bookstore", "book_store", "cafe"), row("Rough Trade East", "record_store")];
    expect(namedLike(rows, "housing works bookstore cafe").map((r) => r.name)).toEqual(["Housing Works Bookstore"]);
    expect(namedLike(rows, "zzz").map((r) => r.name)).toEqual(["Housing Works Bookstore", "Rough Trade East"]);
    expect(sharedWords("Shakespeare and Company Café", "shakespeare and company")).toBe(2);
  });
});
