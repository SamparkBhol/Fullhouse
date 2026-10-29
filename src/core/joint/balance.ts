import type { CrowdSplit, Rising } from "../../shared/contract.ts";
import { sameId } from "../qloo/values.ts";

export const EVEN_LOW = 35;
export const EVEN_HIGH = 65;
export const BALANCE_TOP = 10;

// The split is read inside one response only: each crowd's explainability share of this one pick, as whole numbers that sum to 100.
export function splitOf(r: Pick<Rising, "explain">, venueId: string, partnerId: string): CrowdSplit | null {
  const v = r.explain?.find((x) => sameId(x.entityId, venueId))?.share;
  const p = r.explain?.find((x) => sameId(x.entityId, partnerId))?.share;
  if (v === undefined || p === undefined || v < 0 || p < 0 || v + p <= 0) return null;
  const venue = Math.round((100 * v) / (v + p));
  return { venue, partner: 100 - venue };
}

export function nearEven(s: CrowdSplit): boolean {
  return s.venue >= EVEN_LOW && s.venue <= EVEN_HIGH;
}
