import { describe, expect, it } from "vitest";
import { checkClaims, findNames, normalizeName } from "../../src/core/index.ts";

const allowed = ["Cafe Lumen", "Brooklyn", "Alice Coltrane", "Kettle Books", "Sade", "Natural Wine"];

describe("checkClaims", () => {
  it("passes prose that only names what the brief holds", () => {
    const text = "On Thursday 29 October from 19:00, Cafe Lumen plays Alice Coltrane records. Between records we play Sade. Free to come in. RSVP at the link.";
    expect(checkClaims(text, allowed)).toEqual({ ok: true, unverified: [] });
  });

  it("flags multiword names that are not in the brief", () => {
    const r = checkClaims("Join us at Cafe Lumen for a night with Miles Davis and John Coltrane.", allowed);
    expect(r.ok).toBe(false);
    expect(r.unverified).toEqual(["Miles Davis", "John Coltrane"]);
  });

  it("flags quoted titles and single names mid sentence", () => {
    expect(checkClaims('We are showing "Kind of Blue" tonight.', allowed).unverified).toEqual(["Kind of Blue"]);
    expect(checkClaims("Grab a seat, then grab a Negroni from Dante.", allowed).unverified).toEqual(["Negroni", "Dante"]);
    expect(checkClaims("We open at seven. Fans of Radiohead and Portishead welcome.", allowed).unverified).toEqual(["Radiohead", "Portishead"]);
  });

  it("does not judge a lone capitalised word that opens a sentence", () => {
    expect(checkClaims("We open at seven. Radiohead fans welcome.", allowed).unverified).toEqual([]);
  });

  it("matches names regardless of case, accents and possessives", () => {
    expect(checkClaims("Café Lumen's Alice COLTRANE night.", ["cafe lumen", "Alice Coltrane"]).ok).toBe(true);
    expect(checkClaims("A night at CAFÉ LUMEN", ["Cafe Lumen"]).ok).toBe(true);
    expect(checkClaims("Natural wine from Kettle Books's friends.", allowed).ok).toBe(true);
    expect(normalizeName("  Beyoncé’s  Café & Bar ")).toBe("beyonce cafe and bar");
  });

  it("lets generic words, days, months and parts of allowed names through", () => {
    expect(checkClaims("Thursday Night Listening Session, Free Entry. See you at Lumen on Friday 6 November.", allowed).ok).toBe(true);
    expect(checkClaims("Brooklyn City Quiz Night", allowed).ok).toBe(true);
    expect(checkClaims("Cafe Lumen on Tue 27 Oct, doors at 19:00. Back on Sat 7 Nov.", allowed).ok).toBe(true);
    expect(checkClaims("Partnership Opportunity: A Listening Night Invitation from Cafe Lumen", allowed).ok).toBe(true);
    expect(checkClaims('Bring your "no live music" sign', allowed).ok).toBe(true);
  });

  it("does not let an allowed name smuggle an unknown one", () => {
    expect(checkClaims("Alice Coltrane Pharoah Sanders night", allowed).unverified).toEqual(["Alice Coltrane Pharoah Sanders"]);
  });

  it("finds names across punctuation", () => {
    expect(findNames("Playlist: Radiohead, Massive Attack (live), Jean-Luc Ponty.").map((f) => f.text)).toEqual(["Radiohead", "Massive Attack", "Jean-Luc Ponty"]);
  });
});
