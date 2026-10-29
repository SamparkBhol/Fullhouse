import type { HeatCell } from "../../src/shared/contract.ts";

export interface RankedCell {
  cell: HeatCell;
  order: number | null;
  bucket: number | null;
}

export const HEAT_BUCKETS = 5;

// The read marks a square Qloo had no data for; older reads only show it as rank 0 with popularity 0.
function hasRead(cell: HeatCell): boolean {
  if (cell.noRead || typeof cell.affinityRank !== "number" || !Number.isFinite(cell.affinityRank)) return false;
  return !(cell.affinityRank === 0 && (cell.popularity ?? 0) === 0);
}

// affinityRank may arrive as Qloo's 0 to 1 affinity_rank (higher is stronger) or as an ordinal (1 is strongest).
// Whole numbers above 1 mean ordinal; anything else is treated as the Qloo value.
export function rankCells(cells: HeatCell[]): RankedCell[] {
  const read = cells.filter(hasRead);
  const ordinal = read.length > 0 && read.every((c) => Number.isInteger(c.affinityRank) && c.affinityRank >= 1) && read.some((c) => c.affinityRank > 1);
  const sorted = [...read].sort((a, b) => (ordinal ? a.affinityRank - b.affinityRank : b.affinityRank - a.affinityRank));
  const orderOf = new Map<HeatCell, number>();
  sorted.forEach((c, i) => orderOf.set(c, i + 1));
  return cells.map((cell) => {
    const order = orderOf.get(cell) ?? null;
    if (order === null) return { cell, order: null, bucket: null };
    const bucket = Math.min(HEAT_BUCKETS - 1, Math.floor(((order - 1) / Math.max(1, sorted.length)) * HEAT_BUCKETS));
    return { cell, order, bucket };
  });
}
