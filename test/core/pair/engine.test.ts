import { describe, expect, it } from "vitest";
import { pairStep } from "../../../src/core/pair/engine.ts";
import { matchFor } from "../../../src/core/pair/rematch.ts";
import { createQloo } from "../../../src/core/qloo/client.ts";
import { createRunner } from "../../../src/core/street/runner.ts";
import { resolveVenue } from "../../../src/core/street/steps/resolve.ts";
import type { StreetRead } from "../../../src/shared/contract.ts";
import { fakeFetch, type Route } from "../../fixtures/street.ts";
import { REGGIO, liveBody, livePlaces, placeNamed } from "./live.ts";

const NOW = new Date("2026-10-29T16:00:00.000Z");
const reggio = REGGIO();
const places = livePlaces("reggio_loved");
const OLIVE = placeNamed(places, "Olive Tree Cafe").id;
const VESELKA = placeNamed(places, "Veselka").id;
const STRAND = placeNamed(places, "Strand Bookstore").id;

// Each partner's own list; places without a saved answer get Veselka's list with Caffe Reggio taken out.
const route: Route = (url) => {
  const p = url.searchParams;
  if (url.pathname === "/v2/analysis/compare") return { status: 200, body: liveBody(p.get("b.signal.interests.entities") === OLIVE ? "reggio_olive_tree_compare" : "reggio_veselka_compare") };
  if (url.pathname !== "/v2/insights" || p.get("filter.type") !== "urn:entity:place") return undefined;
  const signal = p.get("signal.interests.entities");
  if (signal === OLIVE) return { status: 200, body: liveBody("reggio_back_olive_tree") };
  if (signal === VESELKA) return { status: 200, body: liveBody("reggio_back_veselka") };
  const body = liveBody("reggio_back_veselka");
  return { status: 200, body: { ...body, results: { entities: body.results.entities.filter((e: { entity_id: string }) => e.entity_id !== reggio.entity.id) } } };
};

function setup() {
  const f = fakeFetch([route]);
  const q = createQloo({ apiKey: "pair-key", fetch: f.fetch, now: () => NOW, sleep: async () => {} });
  return { q, run: createRunner(q, 30, 3), ctx: resolveVenue(reggio, NOW), calls: f.calls };
}

describe("the pairing engine", () => {
  it("asks the eight candidates that score best on everything else whether their crowd loves the venue back, inside the same circle", async () => {
    const { run, ctx, calls } = setup();
    const out = await pairStep(run, ctx, reggio, places, 0, NOW.toISOString());
    const backs = calls.filter((c) => c.url.searchParams.get("filter.type") === "urn:entity:place");
    const asked = backs.map((c) => c.url.searchParams.get("signal.interests.entities"));
    expect(asked).toHaveLength(8);
    for (const n of ["Strand Bookstore", "Olive Tree Cafe", "Mezzrow", "The Bitter End", "Smalls Jazz Club"]) expect(asked).toContain(placeNamed(places, n).id);
    for (const c of backs) {
      const p = c.url.searchParams;
      expect(Object.fromEntries(p)).toEqual({
        "filter.type": "urn:entity:place",
        "filter.location": "POINT(-74.000371 40.730308)",
        "filter.location.radius": "1200",
        "signal.interests.entities": p.get("signal.interests.entities"),
        "filter.exclude.entities": p.get("signal.interests.entities"),
        take: "50",
      });
    }
    expect(calls.filter((c) => c.url.pathname === "/v2/analysis/compare")).toHaveLength(1);
    expect(calls).toHaveLength(9);
    expect(out.match?.partner.name).toBe("Olive Tree Cafe");
    expect(out.match?.fit?.score).toBe(87);
    expect(out.match?.reverseRank).toEqual({ checked: true, rank: 3, of: 50 });
    expect(out.match?.runnersUp.map((p) => [p.name, p.fit?.score])).toEqual([
      ["Mezzrow", 65],
      ["Strand Bookstore", 64],
    ]);
    expect(out.match?.venueKind).toBe("cafe");
    expect(out.match?.shared.map((t) => t.name)).toEqual(out.match?.partner.shared?.map((t) => t.name));
  });

  it("never offers a rival or a place that cannot host", async () => {
    const { run, ctx } = setup();
    const out = await pairStep(run, ctx, reggio, places, 0, NOW.toISOString());
    const all = [out.match!.partner, ...out.match!.runnersUp];
    for (const p of all) expect(p.kind).not.toBe("cafe");
    expect(all.map((p) => p.name)).not.toContain("Cure Thrift Shop");
  });

  it("swaps to a runner up with one compare call and keeps the old match as a runner up", async () => {
    const { q, run, ctx, calls } = setup();
    const step = await pairStep(run, ctx, reggio, places, 0, NOW.toISOString());
    const { rows, rowOf } = run.provenance();
    const { settleMatch } = await import("../../../src/core/pair/settle.ts");
    const read = { at: NOW.toISOString(), lovedPlaces: places, provenance: rows, match: settleMatch(step.match!, rowOf) } as unknown as StreetRead;
    const before = calls.length;
    const out = await matchFor(q, reggio, read, STRAND);
    expect(calls.length - before).toBe(1);
    expect(out?.match.partner.name).toBe("Strand Bookstore");
    expect(out?.match.runnersUp.map((p) => p.name)).toEqual(["Olive Tree Cafe", "Mezzrow"]);
    const { nearerFirst } = await import("../../../src/core/pair/engine.ts");
    const far = { ...step.match!.partner, distanceM: 900, fit: { ...step.match!.fit!, score: 70 } };
    const near = { ...step.match!.runnersUp[0]!, distanceM: 120, fit: { ...step.match!.runnersUp[0]!.fit!, score: 66 } };
    expect(nearerFirst([far, near]).map((p) => p.name)).toEqual([near.name, far.name]);
    expect(nearerFirst([{ ...far, fit: { ...far.fit, score: 80 } }, near]).map((p) => p.name)).toEqual([far.name, near.name]);
    expect(out?.match.fit?.checks.find((c) => c.key === "back")?.sentence).toMatch(/^Caffe Reggio is not among the \d+ places Strand Bookstore's crowd loves nearby\.$/);
    expect(await matchFor(q, reggio, read, "not-a-runner-up")).toBeNull();
  });
});
