import type { QlooType } from "../../shared/contract.ts";
import { resultRows } from "./results.ts";
import { num, obj, str } from "./values.ts";

// Place, book and videogame are refused by /v2/trending.
export const TRENDING_TYPES: QlooType[] = ["artist", "movie", "tv_show", "podcast", "brand", "person"];

// Windows that start after early May 2026 come back empty on the hackathon host; 26 weeks returns weekly points.
export const TREND_WEEKS = 26;

export interface TrendPoint {
  date: string;
  percentile: number | null;
  rank: number | null;
  rankVelocity: number | null;
  foldChange: number | null;
  percentDelta: number | null;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function trendWindow(now: Date, weeks = TREND_WEEKS): { start: string; end: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - weeks * 7 * 86400000);
  return { start: isoDate(start), end: isoDate(end) };
}

// Points arrive newest first; population_rank is a string and population_percentile runs 0 to 1.
export function parseTrending(body: unknown): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (const row of resultRows(body, "trending")) {
    const p = obj(row);
    const date = str(p.date);
    if (!date) continue;
    out.push({
      date,
      percentile: num(p.population_percentile),
      rank: num(p.population_rank),
      rankVelocity: num(p.population_rank_velocity),
      foldChange: num(p.velocity_fold_change),
      percentDelta: num(p.population_percent_delta),
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
