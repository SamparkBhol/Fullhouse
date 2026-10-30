import { describe, expect, it } from "vitest";
import type { Match, StreetRead } from "../../src/shared/contract.ts";
import { jointExample } from "../../src/worker/venue/joint.ts";
import { VenueRecords } from "../../src/worker/venue/records.ts";
import { MemoryStore } from "../../src/worker/store.ts";
import { liveNight, plan } from "../core/night/live.ts";
import { livePlaces } from "../core/pair/live.ts";

// A read stored before the board existed: the match has no verdicts on it.
async function stored(): Promise<{ records: VenueRecords; match: Match }> {
  const daunt = liveNight("night2_daunt_etna");
  const { considered: _, consideredOf: __, ...match } = daunt.match;
  const read: StreetRead = { ...daunt.read, lovedPlaces: livePlaces("daunt_loved"), match, at: match.readAt };
  const store = new MemoryStore();
  await store.put("venue", daunt.venue);
  await store.put("read", read);
  return { records: new VenueRecords(store), match };
}

describe("the board on reads stored before it existed", () => {
  it("is built from the stored list with no call to Qloo", async () => {
    const { records } = await stored();
    const read = await records.read();
    const rows = read?.match?.considered ?? [];
    expect(rows[0]).toMatchObject({ rank: 1, verdict: "not_a_room", reason: "A tennis shop, not a room for a night." });
    expect(rows.find((r) => r.verdict === "partner")).toMatchObject({ name: "EtnaCoffee", rank: 11 });
    expect(read?.match?.consideredOf).toBe(50);
  });

  it("says when the partner on the board was the owner's own pick", async () => {
    const { records, match } = await stored();
    const [kpop, ...rest] = match.runnersUp;
    await records.store.put("match", { ...match, partner: kpop, runnersUp: [match.partner, ...rest] });
    const rows = (await records.match())?.considered ?? [];
    expect(rows.find((r) => r.verdict === "partner")).toMatchObject({ name: "K-POP", reason: "73 of 100. Your pick over EtnaCoffee at 75." });
    expect(rows.find((r) => r.name === "EtnaCoffee")?.verdict).toBe("runner_up");
  });

  it("sends the landing the first six rows with the partner's row when it is further down", async () => {
    const { records } = await stored();
    const response = plan(liveNight("night2_daunt_etna"));
    await records.saveProposals(response, {});
    const out = await jointExample(records);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.considered?.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 11]);
    expect(out.value.considered?.at(-1)).toMatchObject({ verdict: "partner", name: "EtnaCoffee" });
    expect(out.value.consideredOf).toBe(50);
  });
});
