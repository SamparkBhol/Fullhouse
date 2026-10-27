import type { Trend } from "../../shared/contract.ts";
import type { QTrending, TrendPoint } from "../qloo/parse.ts";

export interface TrendRead {
  trend: Trend;
  note?: string;
}

function pctEps(a: number, b: number): number {
  return Math.max(Math.abs(a), Math.abs(b)) <= 1 ? 0.002 : 0.2;
}

function fromSeries(points: TrendPoint[]): TrendRead | null {
  const newest = points[0];
  const oldest = points[points.length - 1];
  if (!newest || !oldest || points.length < 2) return null;
  const span = `between the weeks of ${oldest.date} and ${newest.date}`;
  if (newest.rank !== null && oldest.rank !== null && newest.rank !== oldest.rank) {
    const up = newest.rank < oldest.rank;
    return {
      trend: up ? "rising" : "falling",
      note: `Weekly popularity rank went from ${oldest.rank} to ${newest.rank} ${span}`,
    };
  }
  if (newest.percentile !== null && oldest.percentile !== null) {
    const delta = newest.percentile - oldest.percentile;
    const eps = pctEps(newest.percentile, oldest.percentile);
    if (delta > eps) return { trend: "rising", note: `Weekly popularity percentile went up ${span}` };
    if (delta < -eps) return { trend: "falling", note: `Weekly popularity percentile went down ${span}` };
    return { trend: "steady", note: `Weekly popularity held level ${span}` };
  }
  if (newest.rank !== null && oldest.rank !== null) {
    return { trend: "steady", note: `Weekly popularity rank held at ${newest.rank} ${span}` };
  }
  return null;
}

function fromSinglePoint(p: TrendPoint): TrendRead | null {
  const week = `in the week of ${p.date}`;
  if (p.percentDelta !== null && p.percentDelta !== 0) {
    return p.percentDelta > 0
      ? { trend: "rising", note: `Popularity went up ${week}` }
      : { trend: "falling", note: `Popularity went down ${week}` };
  }
  if (p.foldChange !== null && p.foldChange !== 1) {
    return p.foldChange > 1
      ? { trend: "rising", note: `Momentum picked up ${week}` }
      : { trend: "falling", note: `Momentum slowed ${week}` };
  }
  if (p.rankVelocity !== null && p.rankVelocity !== 0) {
    return p.rankVelocity > 0
      ? { trend: "rising", note: `Rank moved up ${week}` }
      : { trend: "falling", note: `Rank moved down ${week}` };
  }
  if (p.percentDelta === 0 || p.foldChange === 1 || p.rankVelocity === 0) {
    return { trend: "steady", note: `Popularity held level ${week}` };
  }
  return null;
}

export function classifyTrend(t: QTrending, entityId: string, typeLabel: string): TrendRead {
  const series = fromSeries(t.points);
  if (series) return series;
  const single = t.points[0] ? fromSinglePoint(t.points[0]) : null;
  if (single) return single;
  const id = entityId.toUpperCase();
  const hit = t.ranked.find((r) => r.id.toUpperCase() === id);
  if (hit) {
    return {
      trend: "rising",
      note: `Listed${hit.trendRank !== null ? ` at trend rank ${hit.trendRank}` : ""} among the ${typeLabel} rising fastest in Qloo's trending list`,
    };
  }
  if (t.ranked.length) return { trend: "unknown", note: `Not in the ${typeLabel} trending list Qloo returned for this window` };
  return { trend: "unknown" };
}
