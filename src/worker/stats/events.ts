import type { NightFormat, NightPlan } from "../../shared/contract.ts";
import type { MondayProposal } from "../../shared/stats.ts";

// Events carry counts, ids and public names only. Owner typed text and owner email never go in one.
// The venue id lets the Meter drop a venue's log lines when its pages come down; it never reaches a reader.
export type StatEvent =
  | { kind: "venue_created"; venueId: string }
  | { kind: "street_read"; venueId: string; calls: number; cached: number }
  | { kind: "plan_made"; venueId: string; format: NightFormat; origin: NightPlan["origin"]; copy: "model" | "template" }
  | { kind: "night_published"; venueId: string; venue: string; verified: boolean; format: NightFormat; date: string }
  | { kind: "rsvp"; venueId: string; venue: string; verified: boolean }
  // A correction carries the time the night was first counted, so it lands in the same hour as the first count.
  | { kind: "turnout"; venueId: string; nights: number; people: number; roomNights: number; seats: number; roomPeople: number; firstAt?: string }
  | { kind: "monday_run"; venueId: string; planned: boolean; proposal?: MondayProposal }
  | { kind: "invite_sent"; venueId: string }
  | { kind: "invite_answered"; venueId: string; answer: "yes" | "no" }
  | { kind: "mcp_call"; tool: string }
  | { kind: "qloo_call"; endpoint: string; cached: boolean; ms: number }
  | { kind: "qloo_error"; endpoint: string; error: string }
  // Not counted. "nights" drops the venue's publish and RSVP lines, "all" every line it has in the log.
  | { kind: "forget_venue"; venueId: string; lines: "nights" | "all" }
  // Not counted. Budget the request set aside and did not use, handed back to today's count.
  | { kind: "budget_unused"; calls: number; day: string };

export type StampedEvent = StatEvent & { at: string };

export interface StatsSink {
  add(event: StatEvent): void;
  // Runs when the request's events are taken, for figures only known at the end, such as unused budget.
  atEnd(last: () => StatEvent | null): void;
}

export function recordEvent(sink: StatsSink | null | undefined, event: StatEvent | null): void {
  if (sink && event) sink.add(event);
}
