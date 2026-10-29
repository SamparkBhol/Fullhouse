import { describe, expect, it } from "vitest";
import { pairFormat } from "../../../src/core/night/grammar.ts";
import { dayFit, schedule, type Setup } from "../../../src/core/night/schedule.ts";
import { order, stopsOf, timeline, type Side } from "../../../src/core/night/stops.ts";
import type { QuietSlot, Rising } from "../../../src/shared/contract.ts";

type Hours = Record<string, { opens: string; closes: string }[] | { closed: true }[]>;
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const every = (opens: string, closes: string): Hours => Object.fromEntries(DAYS.map((d) => [d, [{ opens, closes }]]));
const side = (at: Side["at"], name: string, group: Side["group"], hours?: Hours): Side => ({ at, group, place: { id: name, name, tags: [], ...(hours ? { hours } : {}) } });
const TUESDAY: QuietSlot = { weekday: 2, start: "19:00", durationMin: 180 };
const NOW = new Date("2026-10-29T16:00:00.000Z");
const film = (minutes: number): Rising => ({ id: "f", name: "A Film", type: "movie", rank: 1, trend: "unknown", because: [], minutes });

function setup(venue: Side, partner: Side, distanceM = 300): Setup {
  return { def: pairFormat(venue.group, partner.group), venue, partner, slot: TUESDAY, distanceM };
}

describe("the order of the two stops", () => {
  it("opens with the place that hosts the main activity, and puts drinks or coffee second", () => {
    const cafe = side("venue", "Cafe", "coffee", every("08:00", "23:00"));
    const shop = side("partner", "Shop", "book", every("09:00", "23:00"));
    const [first, second] = order(pairFormat("coffee", "book"), cafe, shop, 2);
    expect([first.place.name, second.place.name]).toEqual(["Shop", "Cafe"]);
  });

  it("rounds the walk up to the next quarter hour and runs the second stop to the slot's end", () => {
    const [a, b] = timeline(60, 120, 19 * 60, 180, 1126);
    expect([a, b]).toEqual([
      { start: 1140, end: 1200 },
      { start: 1230, end: 1350 },
    ]);
  });
});

describe("the day and the start, from each stop's own hours", () => {
  it("starts an hour early for a bookshop that shuts at 19:00 every day, instead of a book club behind a locked door", () => {
    const shop = side("venue", "Housing Works", "book", every("11:00", "19:00"));
    const cinema = side("partner", "Angelika", "film");
    const s = schedule(setup(shop, cinema, 153), "America/New_York", NOW);
    expect(s.fitting).toMatchObject({ earlier: 60, afterHours: false, day: { date: "2026-11-03" } });
    expect(s.fitting.arranged.times[0]).toEqual({ start: 18 * 60, end: 19 * 60 });
    expect(s.fitting.unknown.map((x) => x.place.name)).toEqual(["Angelika"]);
  });

  it("puts a cafe that shuts at 20:00 first, and has the bookshop open late for its book club", () => {
    const shop = side("venue", "Daunt", "book", every("09:00", "19:30"));
    const cafe = side("partner", "Etna", "coffee", every("08:30", "20:00"));
    const s = schedule(setup(shop, cafe, 313), "Europe/London", NOW);
    expect(s.fitting.arranged.swapped).toBe(true);
    expect(s.fitting.arranged.first.place.name).toBe("Etna");
    expect(s.fitting.afterHours).toBe(true);
    expect(s.blockers.map((b) => b.place.name)).toEqual(["Daunt", "Etna"]);
  });

  it("moves to the nearest weekday when the partner is shut on the quiet one", () => {
    const shut: Hours = { ...every("17:00", "23:00"), tuesday: [{ closed: true }] };
    const bar = side("venue", "Bar", "drinks", every("17:00", "01:00"));
    const cafe = side("partner", "Cafe", "coffee", shut);
    const s = schedule(setup(bar, cafe), "America/New_York", NOW);
    expect(s).toMatchObject({ moved: true, fitting: { day: { weekday: 3, date: "2026-11-04" } } });
  });

  it("never makes a shut coffee shop an evening stop: with no evening it is open, the night is stuck and says so", () => {
    const shop = side("venue", "Shop", "book", every("09:00", "23:00"));
    const cafe = side("partner", "Cafe", "coffee", every("07:00", "17:00"));
    const s = schedule(setup(shop, cafe), "America/New_York", NOW);
    expect(s.stuck).toBe(true);
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => dayFit(setup(shop, cafe), d as QuietSlot["weekday"]))).toEqual(Array(7).fill("closed"));
  });

  it("starts a long film early so the show after it still starts by a quarter to ten", () => {
    const cinema = side("venue", "Cinema", "film");
    const theatre = side("partner", "Theatre", "stage");
    const def = { ...pairFormat("film", "stage"), firstMin: 180 };
    const s = schedule({ def, venue: cinema, partner: theatre, slot: TUESDAY, distanceM: 999 }, "America/Los_Angeles", NOW);
    expect(s.fitting.earlier).toBe(60);
    expect(s.fitting.arranged.times[1].start).toBeLessThanOrEqual(21 * 60 + 45);
    const stops = stopsOf(def, s.fitting.arranged, { film: film(161) }, 999, new Set());
    expect(stops.map((x) => [x.name, x.start, x.what])).toEqual([
      ["Cinema", "18:00", "Screening of A Film"],
      ["Theatre", "21:30", "Theatre's own show that night"],
    ]);
  });

  it("counts an evening for the fit only when both stops can be open at their own times", () => {
    const shop = side("venue", "Daunt", "book", every("09:00", "19:30"));
    const cafe = side("partner", "Etna", "coffee", every("08:30", "20:00"));
    expect(dayFit(setup(shop, cafe, 313), 2)).toBe("late");
    const bar = side("partner", "Bar", "drinks", every("12:00", "02:00"));
    expect(dayFit(setup(side("venue", "Shop", "book", every("09:00", "22:00")), bar), 2)).toBe("open");
    expect(dayFit(setup(shop, side("partner", "Unknown", "drinks")), 2)).toBe("unknown");
  });
});
