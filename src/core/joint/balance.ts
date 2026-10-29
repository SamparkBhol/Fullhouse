import type { CrowdSplit, QlooType, Rising } from "../../shared/contract.ts";
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

function offEven(s: CrowdSplit): number {
  return Math.abs(s.venue - 50);
}

export interface Balanced {
  pick: Rising;
  split: CrowdSplit;
}

// Within one list, the pick nearest half and half among the top ten, ties broken by rank.
export function balanceOf(list: Rising[], venueId: string, partnerId: string): Balanced | null {
  const scored = list
    .filter((r) => r.rank <= BALANCE_TOP && r.name.trim() !== "")
    .flatMap((pick) => {
      const split = splitOf(pick, venueId, partnerId);
      return split ? [{ pick, split }] : [];
    })
    .sort((a, b) => offEven(a.split) - offEven(b.split) || a.pick.rank - b.pick.rank);
  return scored[0] ?? null;
}

// One balance pick per type, nearest even first, then by rank, then in the order the types are read.
export function balancePicks(rising: Rising[], venueId: string, partnerId: string, types: QlooType[]): Balanced[] {
  return types
    .flatMap((type) => {
      const b = balanceOf(
        rising.filter((r) => r.type === type),
        venueId,
        partnerId,
      );
      return b ? [b] : [];
    })
    .sort((a, b) => offEven(a.split) - offEven(b.split) || a.pick.rank - b.pick.rank || types.indexOf(a.pick.type) - types.indexOf(b.pick.type));
}
