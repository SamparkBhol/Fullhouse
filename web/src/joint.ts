import type { CrowdSplit, ExamplePlace, JointExample, NightPlan, PlanMatch } from "../../src/shared/contract.ts";

export type { CrowdSplit, Invite, InviteStatus, Match, MatchPartner, PlanMatch } from "../../src/shared/contract.ts";

export function planMatch(plan: NightPlan): PlanMatch | null {
  return plan.match?.partner ? plan.match : null;
}

export function byLine(e: { by?: string }): string | null {
  return e.by?.trim() || null;
}

export interface Example {
  venue: ExamplePlace & { type: "place" };
  partner: ExamplePlace & { type: "place" };
  minutes: number | null;
  title: string | null;
  split: CrowdSplit | null;
  shared: string[];
}

function place(p: ExamplePlace | undefined): (ExamplePlace & { type: "place" }) | null {
  return p && typeof p.name === "string" && p.name.trim() ? { ...p, type: "place" } : null;
}

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
    title: raw.title?.trim() || null,
    split,
    shared: (raw.shared ?? []).filter((t) => typeof t === "string" && t.trim()).slice(0, 3),
  };
}
