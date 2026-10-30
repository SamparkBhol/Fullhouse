import { describe, expect, it } from "vitest";
import { renderLiveText } from "../../../src/worker/stats/text.ts";
import { at, clock, statsCore } from "./sqlite.ts";

const NOW = "2026-10-30T10:00:00.000Z";

describe("answers to invites in the stats", () => {
  it("counts each yes and each no by its reason, with a no sent without one apart", async () => {
    const c = clock(NOW);
    const { core } = statsCore(c.now);
    await core.record([
      at(NOW, { kind: "invite_answered", venueId: "V1", answer: "yes" }),
      at(NOW, { kind: "invite_answered", venueId: "V1", answer: "no", reason: "day" }),
      at(NOW, { kind: "invite_answered", venueId: "V2", answer: "no", reason: "day" }),
      at(NOW, { kind: "invite_answered", venueId: "V2", answer: "no", reason: "events" }),
      at(NOW, { kind: "invite_answered", venueId: "V3", answer: "no" }),
    ]);
    const body = await core.stats("24h");
    expect(body.totals.answers).toEqual([
      { key: "yes", n: 1 },
      { key: "kind", n: 0 },
      { key: "day", n: 2 },
      { key: "events", n: 1 },
      { key: "other", n: 0 },
      { key: "unsaid", n: 1 },
    ]);
    expect(body.totals.invitesAccepted).toBe(1);
    expect(body.events.map((e) => e.line)).toContain("A neighbour said not this time to a shared night. Its reason: wrong day or time.");
    expect(renderLiveText(body)).toContain("yes 1, wrong day or time 2, we do not run events 1, no reason given 1");
    expect(JSON.stringify(body)).not.toContain("V1");
  });
});
