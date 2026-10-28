import type { Night, NightPlan, StreetRead, Venue } from "../../shared/contract.ts";
import type { StatEvent } from "./events.ts";

export function readEvent(venue: Venue, read: StreetRead): StatEvent {
  const cached = read.provenance.filter((p) => p.cached).length;
  return { kind: "street_read", venueId: venue.id, calls: read.provenance.length - cached, cached };
}

export function planEvent(venue: Venue, plan: NightPlan): StatEvent {
  return { kind: "plan_made", venueId: venue.id, format: plan.format, origin: plan.origin, copy: plan.copy.writtenBy };
}

export function publishEvent(venue: Venue, night: Night): StatEvent {
  return { kind: "night_published", venueId: venue.id, venue: venue.entity.name, verified: venue.verified === true, format: night.format, date: night.date };
}

export function rsvpEvent(venue: Venue): StatEvent {
  return { kind: "rsvp", venueId: venue.id, venue: venue.entity.name, verified: venue.verified === true };
}

// What the totals hold for one night: its head count, the room it was measured against, and when it was first counted.
export interface Counted {
  people: number;
  room: number | null;
  at?: string;
}

function roomShare(c: Counted | undefined): { nights: number; seats: number; people: number } {
  return c && c.room !== null ? { nights: 1, seats: c.room, people: c.people } : { nights: 0, seats: 0, people: 0 };
}

// The totals move by the difference from what was counted before, so a corrected night is never counted twice
// and a room size set after the first count joins the seat totals once.
export function turnoutEvent(venueId: string, before: Counted | undefined, after: Counted): StatEvent {
  const was = roomShare(before);
  const now = roomShare(after);
  const event: Extract<StatEvent, { kind: "turnout" }> = {
    kind: "turnout",
    venueId,
    nights: before ? 0 : 1,
    people: after.people - (before?.people ?? 0),
    roomNights: now.nights - was.nights,
    seats: now.seats - was.seats,
    roomPeople: now.people - was.people,
  };
  if (before?.at) event.firstAt = before.at;
  return event;
}

export function mondayEvent(venue: Venue, plan: NightPlan | null): StatEvent {
  if (!plan) return { kind: "monday_run", venueId: venue.id, planned: false };
  const proposal = { id: plan.id, date: plan.date, start: plan.start, format: plan.format, title: plan.copy.eventTitle };
  return { kind: "monday_run", venueId: venue.id, planned: true, proposal: plan.feature ? { ...proposal, feature: plan.feature.name } : proposal };
}

export function forgetVenue(venue: Venue, lines: "nights" | "all"): StatEvent {
  return { kind: "forget_venue", venueId: venue.id, lines };
}
