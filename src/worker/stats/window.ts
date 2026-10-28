import type { StatsRange } from "../../shared/stats.ts";
import { hourOf } from "./schema.ts";

// A window counts in units of one hour or one day. Buckets group units, and the last bucket holds now.
export interface StatsWindow {
  range: StatsRange;
  unitHours: 1 | 24;
  bucketUnits: number;
  first: number;
  count: number;
}

export function windowFor(range: StatsRange, now: Date): StatsWindow {
  const hour = hourOf(now.getTime());
  if (range === "30d") return { range, unitHours: 24, bucketUnits: 1, first: Math.floor(hour / 24) - 29, count: 30 };
  if (range === "7d") return { range, unitHours: 1, bucketUnits: 6, first: Math.floor(hour / 6) * 6 - 27 * 6, count: 28 };
  return { range, unitHours: 1, bucketUnits: 1, first: hour - 23, count: 24 };
}

export function bucketIndex(w: StatsWindow, unit: number): number {
  const i = Math.floor((unit - w.first) / w.bucketUnits);
  return i >= 0 && i < w.count ? i : -1;
}

export function bucketStarts(w: StatsWindow): string[] {
  return Array.from({ length: w.count }, (_, i) => new Date((w.first + i * w.bucketUnits) * w.unitHours * 3_600_000).toISOString());
}

export function unitSpan(w: StatsWindow): { from: number; to: number } {
  return { from: w.first, to: w.first + w.count * w.bucketUnits };
}
