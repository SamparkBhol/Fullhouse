import { describe, expect, it } from "vitest";
import { bannedIn, hasDash } from "../../../src/core/copy/text.ts";
import { MIN_POPULARITY, evenPicks, namesVenue, usable } from "../../../src/core/night/picks.ts";
import type { NightPlan, PlanResponse, Rising } from "../../../src/shared/contract.ts";
import { liveNight, plan, stopsText } from "./live.ts";

const hw = liveNight("night2_hw_angelika");
const reggio = liveNight("night2_reggio_olive");
const daunt = liveNight("night2_daunt_etna");
const pcc = liveNight("night2_pcc_soho");
const vesuvio = liveNight("night2_vesuvio_sodini");
const gallery = liveNight("night2_tpg_regent");
const cityLights = liveNight("night2_city_lights_great_star");
const oldReggio = liveNight("night_reggio_olive");

function words(r: PlanResponse): string {
  const all = [r.plan, ...r.alternatives];
  return all.flatMap((p: NightPlan) => [p.copy.eventTitle, p.copy.eventDescription, p.copy.social, p.copy.partnerPitch.body, p.pair?.why ?? "", ...p.why.map((b) => b.text), ...p.limits, ...(p.pair?.stops ?? []).map((s) => `${s.name} ${s.what}`)]).join("\n");
}

describe("Housing Works and Angelika: book then film", () => {
  const r = plan(hw);

  it("reads the book the film is made from, starting an hour early because the shop shuts at 19:00", () => {
    expect(r.plan.pair?.format).toBe("book_then_film");
    expect(r.plan.copy.eventTitle).toBe("Beautiful Boy: the book, then the film");
    expect(stopsText(r.plan)).toEqual([
      "18:00 to 19:00 at Housing Works Bookstore: Book club on Beautiful Boy by David Sheff",
      "19:15 to 21:30 at Angelika Film Center: Screening of Beautiful Boy",
    ]);
    expect(r.plan.pair?.link).toBe("The film is made from the book, so the room comes to the screening having read it.");
    expect(r.plan.day?.note).toBe(
      "Housing Works Bookstore closes at 19:00 on Tuesdays, so the night starts at 18:00, while it is still open. Angelika Film Center lists no opening hours, so check they are open on Tuesday 3 November before you ask.",
    );
  });

  it("plays no playlist over a book club or a screening, and says the cinema sells its own seats", () => {
    expect(r.plan.playlist).toEqual([]);
    expect(r.plan.pair?.playlistAt).toBeUndefined();
    expect(r.plan.copy.eventDescription).toContain("Angelika Film Center sells its own tickets as usual.");
    expect(r.plan.copy.eventDescription).not.toContain("Free to come in");
  });

  it("offers the next adaptations as the other ideas", () => {
    expect(r.alternatives.map((a) => a.copy.eventTitle)).toEqual(["If Beale Street Could Talk: the book, then the film", "The Hate U Give: the book, then the film"]);
  });

  it("with no adaptation, pairs the book and the film whose tags overlap and says what ties them, never the policy study", () => {
    const loose = plan({ ...hw, joint: hw.joint.filter((x) => !x.filmOf) });
    expect(loose.plan.copy.eventTitle).toBe("The Friday Black book club, then Sorry to Bother You");
    expect(loose.plan.pair?.link).toBe("Both are science fiction stories.");
    for (const p of [loose.plan, ...loose.alternatives]) expect(p.pair?.picks.map((x) => x.name).join(" ")).not.toMatch(/Ghosts in the Schoolyard/);
  });
});

describe("the picks people would come for", () => {
  it("takes the better known book inside the even band before the more even one, and a story before a textbook", () => {
    const v = hw.venue.entity;
    const p = hw.match.partner;
    const books = evenPicks(hw.joint, "book", v.id, p.id, [v.name, p.name]).map((c) => c.pick.name);
    expect(books.slice(0, 2)).toEqual(["Hunger: A Memoir of (My) Body", "Difficult Women"]);
    expect(books.at(-1)).toMatch(/^Ghosts in the Schoolyard/);
  });

  it("drops picks few people know, picks named after either place, box sets and titles joined with a slash", () => {
    const pick = (over: Partial<Rising>): Rising => ({ id: "x", name: "A Book", type: "book", rank: 1, trend: "unknown", because: [], ...over });
    expect(usable(pick({ popularity: MIN_POPULARITY - 0.01 }), [])).toBe(false);
    expect(usable(pick({ popularity: MIN_POPULARITY }), [])).toBe(true);
    expect(usable(pick({ name: "Circe / The Song of Achilles" }), [])).toBe(false);
    expect(usable(pick({ name: "The Midnight Library/Reasons to Stay Alive" }), [])).toBe(false);
    expect(usable(pick({ name: "The Hunger Games Box Set" }), [])).toBe(false);
    expect(namesVenue({ name: "Angelika" }, ["Angelika Film Center & Cafe"])).toBe(true);
    expect(namesVenue({ name: "Housing Works: A History" }, ["Housing Works Bookstore"])).toBe(false);
  });
});

describe("Caffe Reggio and Olive Tree Cafe: a quiz crawl on a set", () => {
  const r = plan(reggio);

  it("asks round one on four TV shows and round two on four films, and is never named after one title", () => {
    expect(r.plan.pair?.format).toBe("quiz_crawl");
    expect(r.plan.copy.eventTitle).toBe("TV and film quiz crawl at Caffe Reggio and Olive Tree Cafe");
    expect(stopsText(r.plan)).toEqual([
      "19:00 to 20:00 at Caffe Reggio: Quiz round one on TV: Master of None, Crazy Ex-Girlfriend, Insecure and PEN15",
      "20:15 to 22:00 at Olive Tree Cafe: Quiz round two on films: Annihilation, Sorry to Bother You, The Last Black Man in San Francisco and If Beale Street Could Talk",
    ]);
    expect(r.plan.copy.eventDescription).toContain("Master of None, Crazy Ex-Girlfriend, Insecure and PEN15");
    expect(r.plan.copy.eventTitle).not.toMatch(/^(Insecure|Master of None) quiz/);
  });

  it("plays the playlist at the bar and at the cafe in the evening, and gives each round one reason", () => {
    expect(r.plan.pair?.playlistAt).toEqual(["venue", "partner"]);
    const rounds = r.plan.why.filter((b) => b.text.startsWith("Round "));
    expect(rounds.map((b) => b.text.slice(0, 40))).toEqual(["Round one is the TV both crowds share: M", "Round two is the films both crowds share"]);
    for (const b of r.plan.why) expect(b.provenance).toBeGreaterThanOrEqual(0);
  });
});

describe("Daunt Books and EtnaCoffee: coffee first, because the cafe shuts at 20:00", () => {
  const r = plan(daunt);

  it("starts at the cafe while it is open, then the book club runs at Daunt after hours, said plainly", () => {
    expect(r.plan.pair?.label).toBe("coffee then book club");
    expect(r.plan.copy.eventTitle).toBe("Coffee, then The Possession of Mr Cave book club");
    expect(stopsText(r.plan)).toEqual([
      "19:00 to 20:00 at EtnaCoffee: Coffee first",
      "20:15 to 22:00 at Daunt Books Marylebone: Book club on The Possession of Mr Cave by Matt Haig",
    ]);
    expect(r.plan.pair?.stops[1]?.afterHours).toBe(true);
    expect(r.plan.copy.eventDescription).toContain("Daunt Books Marylebone opens late for it.");
    expect(r.plan.day?.note).toContain("Daunt Books Marylebone closes at 19:30 on Tuesdays, so this is an after hours event: you open late for the book club.");
  });

  it("plays the playlist at the cafe in the evening and never over the book club", () => {
    expect(r.plan.pair?.playlistAt).toEqual(["partner"]);
  });
});

describe("Prince Charles Cinema and Soho Theatre: film then show", () => {
  const r = plan(pcc);

  it("screens the film at the cinema, then the theatre's own show, and says whose pick the film is", () => {
    expect(r.plan.pair?.format).toBe("film_then_show");
    expect(r.plan.copy.eventTitle).toBe("Little Women, then a show at Soho Theatre");
    expect(stopsText(r.plan)).toEqual([
      "19:00 to 21:30 at Prince Charles Cinema: Screening of Little Women",
      "21:45 to 23:00 at Soho Theatre: Soho Theatre's own show that night",
    ]);
    expect(r.plan.limits).toContain("There is no read of Prince Charles Cinema for films, so this film is the pick of Soho Theatre's crowd.");
    expect(r.plan.copy.eventDescription).toContain("Prince Charles Cinema and Soho Theatre sell their own tickets as usual.");
    expect(r.plan.playlist).toEqual([]);
  });
});

describe("Vesuvio Cafe and Sodini's Trattoria: dinner, then the quiz at the bar", () => {
  it("never stops a restaurant's service for a quiz round: dinner first, both rounds at the bar", () => {
    const r = plan(vesuvio);
    expect(r.plan.pair?.label).toBe("dinner then quiz");
    expect(r.plan.copy.eventTitle).toBe("Dinner, then the TV and film quiz at Vesuvio Cafe");
    expect(stopsText(r.plan)[0]).toBe("19:00 to 20:15 at Sodini's Trattoria: Dinner first");
    expect(stopsText(r.plan)[1]).toMatch(/^20:30 to 22:15 at Vesuvio Cafe: Quiz in two rounds, TV \(.+\), then films \(.+\)$/);
    expect(r.plan.pair?.playlistAt).toEqual(["venue"]);
  });
});

describe("The Photographers' Gallery and Regent Street Cinema: late view then a film", () => {
  it("moves to the gallery's late evening and screens the film about painting", () => {
    const r = plan(gallery);
    expect(r.plan.pair?.format).toBe("late_view");
    expect(r.plan.date).toBe("2026-11-05");
    expect(stopsText(r.plan)[1]).toMatch(/at Regent Street Cinema: Screening of Portrait of a Lady on Fire$/);
    expect(r.plan.pair?.link).toBe("Portrait of a Lady on Fire is about painting, so the late view carries straight on into it.");
    expect(r.plan.day?.note).toMatch(/^The Photographers' Gallery closes at 18:00 on Tuesdays, so the night moves to Thursday 5 November/);
  });
});

describe("City Lights and Great Star Theater: book then film, tied by their tags", () => {
  it("names what the book and the film share and says there is no read of the theatre", () => {
    const r = plan(cityLights);
    expect(r.plan.pair?.picks.map((p) => p.name)).toEqual(["On Earth We're Briefly Gorgeous", "The Farewell"]);
    expect(r.plan.pair?.link).toMatch(/^The book and the film are both about /);
    expect(r.plan.limits).toContain("There is no read of Great Star Theater for books, so this book is the pick of City Lights Booksellers' own crowd.");
  });
});

describe("the words on every night", () => {
  it("uses plain names, one article, no dashes, and no sentence that explains the engine", () => {
    for (const n of [hw, reggio, daunt, pcc, vesuvio, gallery, cityLights]) {
      const r = plan(n);
      const text = words(r);
      for (const p of [r.plan, ...r.alternatives]) expect(p.checks, p.copy.eventTitle).toEqual({ claimsVerified: true, unverified: [] });
      expect(bannedIn(text)).toEqual([]);
      expect(hasDash(text)).toBe(false);
      expect(text).not.toMatch(/\bthe The\b|& Cafe|, New York|Neither place screens|so the night is|dining drinking|joint read with/i);
    }
  });
});

describe("the day of the night (the Caffe Reggio and Veselka bug)", () => {
  const veselka = oldReggio.match.runnersUp.find((p) => p.name === "Veselka")!;

  it("keeps the Tuesday with Veselka, whose listing is a week of closed days, and says to check its hours", () => {
    const r = plan({ ...oldReggio, match: { ...oldReggio.match, partner: veselka, runnersUp: [] } });
    expect(r.plan.date).toBe("2026-11-03");
    expect(r.plan.day?.moved).toBe(false);
    expect(r.plan.day?.note).toBe("Veselka lists no opening hours, so check they are open on Tuesday 3 November before you ask.");
    expect(JSON.stringify(r)).not.toMatch(/closed on Tuesdays/);
  });

  it("moves the night when the partner is listed as shut on the quiet day", () => {
    const shutTuesday = { ...veselka, hours: { ...Object.fromEntries(["sunday", "monday", "wednesday", "thursday", "friday", "saturday"].map((d) => [d, [{ opens: "08:00", closes: "23:00" }]])), tuesday: [{ closed: true }] } };
    const r = plan({ ...oldReggio, match: { ...oldReggio.match, partner: shutTuesday, runnersUp: [] } });
    expect(r.plan.date).toBe("2026-11-04");
    expect(r.plan.day).toMatchObject({ asked: 2, moved: true });
    expect(r.plan.day?.note).toContain("so the night moves to Wednesday 4 November");
  });
});
