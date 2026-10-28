import { createQloo, planNights, readStreet } from "../../src/core/index.ts";
import type { PlanInput, PlanResponse, StreetRead, Venue } from "../../src/shared/contract.ts";
import { NOW, VENUE, fakeFetch, streetRoute } from "../fixtures/street.ts";

// The street read the planner tests plan from, made by the real reader against the fixture answers.
export function fixtureRead(): Promise<StreetRead> {
  const f = fakeFetch([streetRoute]);
  return readStreet(createQloo({ apiKey: "k", fetch: f.fetch, now: () => NOW }), VENUE);
}

function ids(): () => string {
  let n = 0;
  return () => `plan-${++n}`;
}

export function planFrom(read: StreetRead, input: PlanInput = {}, venue: Venue = VENUE): PlanResponse {
  return planNights(read, venue, input, NOW, "owner", ids());
}
