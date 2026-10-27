import type { CityLocalities, ResolvedVenue } from "./plan.ts";
import type { CallRecord } from "./record.ts";
import type { ProbeVenue } from "./venues.ts";

export interface Resolution {
  resolved: ResolvedVenue;
  via: string;
}

export interface ProbeContext {
  now: Date;
  venues: ProbeVenue[];
  localities: Map<string, CityLocalities>;
  resolutions: Map<string, Resolution>;
  gameUrn: string;
  experimentSlugs: string[];
  records: CallRecord[];
  calls: { thisRun: number; ever: number; cap: number };
}

export function recordsFor(ctx: ProbeContext, scope: string): Map<string, CallRecord> {
  return new Map(ctx.records.filter((r) => r.scope === scope).map((r) => [r.call, r]));
}
