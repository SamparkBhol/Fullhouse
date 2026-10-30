import { describe, expect, it } from "vitest";
import { boardOf, relabel, withBoard } from "../../../src/core/pair/board.ts";
import { pairStep } from "../../../src/core/pair/engine.ts";
import { matchFor } from "../../../src/core/pair/rematch.ts";
import { settleMatch } from "../../../src/core/pair/settle.ts";
import { createQloo } from "../../../src/core/qloo/client.ts";
import { listedPoints } from "../../../src/core/street/steps/loved_places.ts";
import { createRunner } from "../../../src/core/street/runner.ts";
import { resolveVenue } from "../../../src/core/street/steps/resolve.ts";
import { boardRows, boardSentence } from "../../../src/shared/board.ts";
import { partnerWhy } from "../../../src/core/pair/verdicts.ts";
import type { Considered, FitCheck, MatchPartner, StreetRead } from "../../../src/shared/contract.ts";
import { fakeFetch, type Route } from "../../fixtures/street.ts";
import { liveNight } from "../night/live.ts";
import { HOUSING_WORKS, liveBody, livePlaces, placeNamed } from "./live.ts";

const NOW = new Date("2026-10-29T16:00:00.000Z");
const at = (rows: Considered[], rank: number) => rows.find((r) => r.rank === rank);

describe("the board for Daunt Books Marylebone", () => {
  const daunt = liveNight("night2_daunt_etna");
  const places = livePlaces("daunt_loved");
  const { considered: _, ...stored } = daunt.match;
  const board = withBoard(stored, daunt.venue, places);
  const rows = board.considered!;

  it("lists Qloo's first fifteen in order, the tennis shop first and EtnaCoffee chosen 11th", () => {
    expect(rows.filter((r) => r.rank <= 15).map((r) => r.rank)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(at(rows, 1)).toMatchObject({ name: "Park Sports The Regent’s Park", kind: "tennis shop", verdict: "not_a_room", reason: "A tennis shop, not a room for a night." });
    expect(at(rows, 11)).toMatchObject({ name: "EtnaCoffee", verdict: "partner", score: 75, reason: "75 of 100, the best of the 8 places scored." });
    expect(board.consideredOf).toBe(50);
  });

  it("says why each of the ten above the partner was passed over", () => {
    expect(at(rows, 2)).toMatchObject({ verdict: "not_a_room", reason: "A department store, not a room for a night." });
    expect(at(rows, 3)).toMatchObject({ verdict: "not_a_room", reason: "A tailor, not a room for a night." });
    expect(at(rows, 4)).toMatchObject({ name: "K-POP", verdict: "runner_up", score: 73 });
    expect(at(rows, 4)?.reason).toMatch(/^73 of 100\. /);
    expect(at(rows, 6)).toMatchObject({ verdict: "not_a_room", reason: "A toy shop, not a room for a night." });
    expect(at(rows, 7)).toMatchObject({ verdict: "rival", reason: "Another bookshop, after the same customers." });
    expect(at(rows, 9)).toMatchObject({ name: "Simple Health Kitchen", verdict: "no_owner", reason: "No website, so no owner to ask." });
    expect(at(rows, 10)).toMatchObject({ verdict: "not_a_room", reason: "A clothes shop, not a room for a night." });
    expect(at(rows, 12)).toMatchObject({ verdict: "runner_up", score: 63 });
    for (const r of rows.filter((x) => x.verdict === "scored")) expect(r.reason).toMatch(/^(\d+ of 100|Scored below Ousia at 63\.)/);
  });

  it("says the decision in one sentence and shows the partner and runners up in the first ten rows", () => {
    expect(boardSentence(rows, board.consideredOf!)).toBe("Full House chose the 11th of Qloo's 50, EtnaCoffee. The 1st, Park Sports The Regent’s Park, is a tennis shop.");
    const { shown, folded } = boardRows(rows, 10);
    expect(shown).toHaveLength(10);
    expect(shown.map((r) => r.verdict)).toEqual(expect.arrayContaining(["partner", "runner_up", "runner_up"]));
    expect(shown.map((r) => r.rank)).toEqual([...shown.map((r) => r.rank)].sort((a, b) => a - b));
    expect(folded.length + shown.length).toBe(rows.length);
    expect(boardRows(rows, 6, ["partner"]).shown.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 11]);
  });

  it("pins the list in the same order and ranks while the read is still running", () => {
    const points = listedPoints(liveBody("daunt_loved"), daunt.venue.entity.id);
    expect(points.map((p) => [p.name, p.rank])).toEqual(places.map((p) => [p.name, p.rank]));
  });
});

describe("the board for Housing Works Bookstore", () => {
  const hw = HOUSING_WORKS();
  const places = livePlaces("hw_loved");
  const ANGELIKA = places[0]!.id;

  // Angelika's own list as Qloo gave it; every other candidate gets that list with Housing Works taken out.
  const route: Route = (url) => {
    const p = url.searchParams;
    if (url.pathname === "/v2/analysis/compare") return { status: 200, body: liveBody("hw_angelika_compare") };
    if (url.pathname !== "/v2/insights" || p.get("filter.type") !== "urn:entity:place") return undefined;
    const body = liveBody("hw_back_angelika");
    if (p.get("signal.interests.entities") === ANGELIKA) return { status: 200, body };
    return { status: 200, body: { ...body, results: { entities: body.results.entities.filter((e: { entity_id: string }) => e.entity_id !== hw.entity.id) } } };
  };

  async function read() {
    const f = fakeFetch([route]);
    const q = createQloo({ apiKey: "board-key", fetch: f.fetch, now: () => NOW, sleep: async () => {} });
    const run = createRunner(q, 30, 3);
    const step = await pairStep(run, resolveVenue(hw, NOW), hw, places, 0, NOW.toISOString());
    return { q, run, match: step.match! };
  }

  it("records the partner first and every rank to fifteen, with the gardens, libraries and churches said the same way as the shops", async () => {
    const { match } = await read();
    const rows = match.considered!;
    expect(at(rows, 1)).toMatchObject({ verdict: "partner", kind: "cinema", reason: `${match.fit!.score} of 100, the best of the 8 places scored.` });
    expect(at(rows, 2)).toMatchObject({ name: "Liz Christy Garden", verdict: "not_a_room", reason: "A community garden, not a room for a night." });
    expect(at(rows, 4)).toMatchObject({ name: "Elmer Holmes Bobst Library", verdict: "not_a_room", reason: "A university library, not a room for a night." });
    expect(at(rows, 7)).toMatchObject({ name: "Mercer Street Books & Records", verdict: "rival", reason: "Another bookshop, after the same customers." });
    expect(at(rows, 8)).toMatchObject({ verdict: "not_a_room", reason: "A Catholic cathedral, not a room for a night." });
    expect(at(rows, 9)).toMatchObject({ verdict: "not_a_room", reason: "A public library, not a room for a night." });
    expect(match.consideredOf).toBe(50);
    expect(boardSentence(rows, 50)).toBe("Full House checked the 50 places Qloo lists for your crowd nearby and chose the 1st, Angelika Film Center.");
  });

  it("keeps every place it scored on the board, even far down the list", async () => {
    const { match } = await read();
    const rows = match.considered!;
    const scoredFully = rows.filter((r) => ["partner", "runner_up"].includes(r.verdict) || (r.verdict === "scored" && !/too low to ask/.test(r.reason)));
    expect(scoredFully).toHaveLength(8);
    expect(rows.filter((r) => r.verdict === "runner_up").map((r) => r.name)).toEqual(match.runnersUp.map((p) => p.name).sort((a, b) => placeNamed(places, a).rank - placeNamed(places, b).rank));
    expect(rows.some((r) => r.rank > 15)).toBe(true);
    expect(rows.map((r) => r.rank)).toEqual([...rows.map((r) => r.rank)].sort((a, b) => a - b));
    for (const r of rows.filter((x) => x.verdict === "scored")) expect(r.score).toBeTypeOf("number");
  });

  it("moves the verdicts when the owner swaps to a runner up, and keeps the rest", async () => {
    const { q, run, match } = await read();
    const { rows: prov, rowOf } = run.provenance();
    const stored = { at: NOW.toISOString(), lovedPlaces: places, provenance: prov, match: settleMatch(match, rowOf) } as unknown as StreetRead;
    const next = match.runnersUp[0]!;
    const out = await matchFor(q, hw, stored, next.id);
    const rows = out!.match.considered!;
    const chosen = rows.find((r) => r.id === next.id)!;
    expect(chosen.verdict).toBe("partner");
    expect(chosen.reason).toBe(`${out!.match.partner.fit!.score} of 100. Your pick over Angelika Film Center at ${match.fit!.score}.`);
    expect(at(rows, 1)?.verdict).toBe("runner_up");
    expect(rows.filter((r) => r.verdict === "not_a_room")).toEqual(match.considered!.filter((r) => r.verdict === "not_a_room"));
    expect(relabel(match.considered!, hw, 50, next, [], match.partner).filter((r) => r.verdict === "runner_up")).toEqual([]);
  });

  it("sets the venue itself and a closed place on the board with their own reasons", () => {
    const [first, second, ...rest] = places;
    const board = boardOf({
      venue: hw,
      places: rest,
      aside: [
        { place: { ...first!, id: hw.entity.id }, why: "you" },
        { place: second!, why: "closed" },
      ],
      scored: [],
      partner: { ...rest[0]! },
      runnersUp: [],
      partnerWhy: "Chosen.",
    });
    expect(board.considered.slice(0, 2).map((r) => [r.rank, r.verdict, r.reason])).toEqual([
      [1, "you", "Your own venue."],
      [2, "closed", "Listed as closed."],
    ]);
    expect(board.of).toBe(places.length);
  });
});

describe("why the partner won", () => {
  const daunt = liveNight("night2_daunt_etna");
  const etna = daunt.match.partner;
  const kpop = daunt.match.runnersUp[0]!;
  const as = (p: MatchPartner, score: number, open = 15): MatchPartner => ({ ...p, fit: { score, checks: [{ key: "open", points: open, max: 15 } as FitCheck] } });

  it("says the rule that broke a tie: the shorter walk, from the real distances", () => {
    expect(etna.rank).toBe(11);
    expect(kpop.rank).toBe(4);
    expect(partnerWhy(as(etna, 73), [as(etna, 73), as(kpop, 73)])).toBe("73 of 100, level with K-POP, and 5 minutes on foot instead of 13.");
    expect(partnerWhy(as(etna, 72), [as(etna, 72), as(kpop, 73)])).toBe("72 of 100, 1 point behind K-POP, and 5 minutes on foot instead of 13.");
  });

  it("says when a level score went to the place higher on the crowd's list", () => {
    expect(partnerWhy(as(kpop, 73), [as(kpop, 73), as(etna, 73)])).toBe("73 of 100, level with EtnaCoffee and higher on your crowd's list, 4th to 11th.");
  });

  it("says the best score plainly, and the best of the places that can open when a higher one is shut", () => {
    expect(partnerWhy(as(etna, 75), [as(etna, 75), as(kpop, 73)], 8)).toBe("75 of 100, the best of the 8 places scored.");
    expect(partnerWhy(as(etna, 70), [as(etna, 70), as(kpop, 74, 0)])).toBe("70 of 100, the best of the places open for the night.");
  });
});
