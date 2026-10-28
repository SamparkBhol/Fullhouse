import { describe, expect, it } from "vitest";
import { newVenueId, VENUE_ID_RE } from "../../src/worker/ids.ts";

describe("ids", () => {
  it("make venue ids from the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) expect(newVenueId()).toMatch(VENUE_ID_RE);
  });
});

