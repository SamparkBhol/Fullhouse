import { describe, expect, it } from "vitest";
import { counted, knownVia, pairLedgers, shareLinks, sideOf, viaCodes } from "../../src/worker/venue/ledger.ts";
import type { Night, Venue } from "../../src/shared/contract.ts";

const venue = { entity: { name: "Caffe Reggio" } } as Venue;
const night = (partner: string, ledger: Night["ledger"], id = partner) => ({ match: { partner: { id, name: partner } }, ledger }) as unknown as Night;

describe("the swap ledger", () => {
  it("gives each place its own link to the same event page", () => {
    const codes = viaCodes(night("Olive Tree Cafe", undefined), venue);
    expect(codes).toEqual({ venue: "caffe-reggio", partner: "olive-tree-cafe" });
    expect(shareLinks("https://fullhouse.example", "quiz-crawl-abc", codes)).toEqual({
      venue: "https://fullhouse.example/e/quiz-crawl-abc?via=caffe-reggio",
      partner: "https://fullhouse.example/e/quiz-crawl-abc?via=olive-tree-cafe",
    });
  });

  it("counts each RSVP for the link it came through, and anything else as direct", () => {
    const codes = viaCodes(night("Olive Tree Cafe", undefined), venue);
    let l = counted(undefined, sideOf("olive-tree-cafe", codes));
    l = counted(l, sideOf("caffe-reggio", codes));
    l = counted(l, sideOf("olive-tree-cafe", codes));
    l = counted(l, sideOf("someone-else", codes));
    l = counted(l, sideOf(undefined, codes));
    expect(l).toEqual({ fromVenue: 1, fromPartner: 2, direct: 2 });
    expect(knownVia("someone-else", codes)).toBeUndefined();
    expect(knownVia("olive-tree-cafe", codes)).toBe("olive-tree-cafe");
  });

  it("adds up every night with the same partner", () => {
    const rows = pairLedgers([
      night("Veselka", { fromVenue: 6, fromPartner: 4, direct: 1 }),
      night("Veselka", { fromVenue: 4, fromPartner: 3, direct: 0 }),
      night("Olive Tree Cafe", { fromVenue: 1, fromPartner: 0, direct: 0 }),
    ]);
    expect(rows).toEqual([
      { partnerId: "Veselka", partnerName: "Veselka", nights: 2, sent: 10, received: 7 },
      { partnerId: "Olive Tree Cafe", partnerName: "Olive Tree Cafe", nights: 1, sent: 1, received: 0 },
    ]);
  });
});
