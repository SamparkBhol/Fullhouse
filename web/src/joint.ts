import type { CrowdSplit, ExamplePlace, FitCheck, JointExample, NightPlan, PlanMatch } from "../../src/shared/contract.ts";

export type { CrowdSplit, Invite, InviteStatus, Match, MatchPartner, PlanMatch } from "../../src/shared/contract.ts";

export function planMatch(plan: NightPlan): PlanMatch | null {
  return plan.match?.partner ? plan.match : null;
}

export function byLine(e: { by?: string }): string | null {
  return e.by?.trim() || null;
}

export interface Example {
  venue: ExamplePlace;
  partner: ExamplePlace;
  minutes: number | null;
  title: string | null;
  kind: string | null;
  split: CrowdSplit | null;
  shared: string[];
  fit: number | null;
  checks: FitCheck[];
  readAt: string | null;
  date: string | null;
  city: string | null;
  stops: NonNullable<JointExample["stops"]>;
  agreed: boolean;
}

function place(p: ExamplePlace | undefined): ExamplePlace | null {
  return p && typeof p.name === "string" && p.name.trim() ? p : null;
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

// The landing prints the example only when both places came back with names.
export function parseExample(raw: JointExample | null): Example | null {
  if (!raw) return null;
  const venue = place(raw.venue);
  const partner = place(raw.partner);
  if (!venue || !partner) return null;
  const split = raw.split && Number.isFinite(raw.split.venue) && Number.isFinite(raw.split.partner) ? raw.split : null;
  return {
    venue,
    partner,
    minutes: Number.isFinite(raw.minutes) && raw.minutes > 0 ? Math.round(raw.minutes) : null,
    title: text(raw.title),
    kind: text(raw.kind),
    split,
    shared: (raw.shared ?? []).filter((t) => typeof t === "string" && t.trim()).slice(0, 3),
    fit: typeof raw.fit === "number" && Number.isFinite(raw.fit) ? Math.round(raw.fit) : null,
    checks: Array.isArray(raw.checks) ? raw.checks.filter((c) => c && typeof c.label === "string" && Number.isFinite(c.points) && Number.isFinite(c.max)) : [],
    readAt: text(raw.readAt),
    date: text(raw.date),
    city: text(raw.city),
    stops: Array.isArray(raw.stops) ? raw.stops : [],
    agreed: raw.agreed === true,
  };
}
