import type { StatEvent } from "./events.ts";

export type Metric =
  | "venue"
  | "read"
  | "plan"
  | "publish"
  | "rsvp"
  | "turnout_nights"
  | "turnout_people"
  | "room_nights"
  | "room_seats"
  | "room_people"
  | "monday"
  | "invite"
  | "answer"
  | "mcp"
  | "qloo_call"
  | "qloo_cache"
  | "qloo_error"
  | "qloo_error_kind";

// The counters /live shows "since counting began" for, kept as running totals so no read scans the day table.
export const ALL_TIME_METRICS: readonly Metric[] = ["venue", "read", "publish", "rsvp", "turnout_nights", "turnout_people"];

export interface Increment {
  metric: Metric;
  label: string;
  n: number;
}

const LABEL_MAX = 60;

const inc = (metric: Metric, n = 1, label = ""): Increment => ({ metric, label: label.slice(0, LABEL_MAX), n });

export function incrementsFor(e: StatEvent): Increment[] {
  switch (e.kind) {
    case "venue_created":
      return [inc("venue")];
    case "street_read":
      return [inc("read")];
    case "plan_made":
      return [inc("plan", 1, e.copy)];
    case "night_published":
      return [inc("publish")];
    case "rsvp":
      return [inc("rsvp")];
    case "turnout":
      return [
        inc("turnout_nights", e.nights),
        inc("turnout_people", e.people),
        inc("room_nights", e.roomNights),
        inc("room_seats", e.seats),
        inc("room_people", e.roomPeople),
      ].filter((i) => Number.isFinite(i.n) && i.n !== 0);
    case "monday_run":
      return [inc("monday", 1, e.planned ? "planned" : "skipped")];
    case "invite_sent":
      return [inc("invite", 1, "sent")];
    case "invite_answered":
      return [inc("invite", 1, e.answer), inc("answer", 1, e.answer === "yes" ? "yes" : (e.reason ?? "unsaid"))];
    case "mcp_call":
      return [inc("mcp", 1, e.tool)];
    case "qloo_call":
      return [inc(e.cached ? "qloo_cache" : "qloo_call", 1, e.endpoint)];
    case "qloo_error":
      return [inc("qloo_error", 1, e.endpoint), inc("qloo_error_kind", 1, e.error)];
    case "forget_venue":
    case "budget_unused":
      return [];
  }
}

// Increments for the same counter in one batch become one row write.
export function mergeIncrements(list: Increment[]): Increment[] {
  const out = new Map<string, Increment>();
  for (const i of list) {
    const key = `${i.metric}\u0000${i.label}`;
    const seen = out.get(key);
    if (seen) seen.n += i.n;
    else out.set(key, { ...i });
  }
  return [...out.values()];
}
