import type { Match, NightPlan, PlanInput, PlanResponse, Rising, StreetRead, Venue } from "../../shared/contract.ts";
import { planPair } from "../night/build.ts";

// With a match, every night is a two stop night for both crowds; the format comes from the two kinds of place.
export function planJoint(read: StreetRead, joint: Rising[], venue: Venue, match: Match, input: PlanInput, now: Date, origin: NightPlan["origin"], newId: () => string): PlanResponse {
  return planPair(read, joint, venue, match, input, now, origin, newId);
}
