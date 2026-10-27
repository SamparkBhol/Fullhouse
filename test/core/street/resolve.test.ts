import { describe, expect, it } from "vitest";
import { resolveVenue } from "../../../src/core/street/steps/resolve.ts";
import { CENTER, NOW, VENUE, VENUE_ID } from "../../fixtures/street.ts";

describe("resolveVenue", () => {
  it("builds the read context from the stored search hit without a call", () => {
    const ctx = resolveVenue(VENUE, NOW);
    expect(ctx).toMatchObject({ entityId: VENUE_ID, name: "Cafe Lumen", center: CENTER, now: NOW });
    expect([...ctx.ownTags]).toEqual(VENUE.entity.tags);
  });

  it("refuses a venue without an id or with impossible coordinates", () => {
    expect(() => resolveVenue({ ...VENUE, entity: { ...VENUE.entity, id: "" } }, NOW)).toThrow(/no Qloo id/);
    expect(() => resolveVenue({ ...VENUE, entity: { ...VENUE.entity, lat: 95 } }, NOW)).toThrow(RangeError);
  });
});
