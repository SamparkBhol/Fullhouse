import type { BudgetToday, LoggedEvent, StatEventKind, StatsBody, StatsRange } from "../../shared/stats.ts";
import { NEW_VENUE_SHARE, type MeterUsage } from "../meter_core.ts";
import type { SqlLike } from "../qloo/caches.ts";
import { aggregate, type CounterRow, type LatencyRow } from "./aggregate.ts";
import { hourOf, metaGet } from "./schema.ts";
import { bucketStarts, unitSpan, windowFor } from "./window.ts";

export const EVENTS_SHOWN = 100;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function budgetToday(sql: SqlLike, usage: MeterUsage, now: Date): BudgetToday {
  const day = Math.floor(hourOf(now.getTime()) / 24);
  const live = sql.exec("SELECT SUM(n) AS n FROM stats_day WHERE d = ? AND metric = 'qloo_call'", day).toArray()[0];
  return {
    day: usage.day,
    counted: usage.qlooCalls,
    budget: usage.qlooBudget,
    newVenueShare: NEW_VENUE_SHARE,
    resetsAt: new Date((day + 1) * 86_400_000).toISOString(),
    liveCalls: num(live?.["n"]),
  };
}

// Day ranges read the day tables and hour ranges the hour tables, so a read touches rows in proportion to its buckets.
export function readStats(sql: SqlLike, range: StatsRange, now: Date, usage: MeterUsage): StatsBody {
  const w = windowFor(range, now);
  const units = unitSpan(w);
  const byDay = w.unitHours === 24;
  const col = byDay ? "d" : "h";
  const rows: CounterRow[] = sql
    .exec(`SELECT ${col} AS t, metric, label, n FROM ${byDay ? "stats_day" : "stats_hour"} WHERE ${col} >= ? AND ${col} < ?`, units.from, units.to)
    .toArray()
    .map((r) => ({ t: num(r["t"]), metric: String(r["metric"]), label: String(r["label"]), n: num(r["n"]) }));
  const latency: LatencyRow[] = sql
    .exec(
      `SELECT endpoint, step, SUM(n) AS n FROM ${byDay ? "stats_latency_day" : "stats_latency_hour"} WHERE ${col} >= ? AND ${col} < ? GROUP BY endpoint, step`,
      units.from,
      units.to,
    )
    .toArray()
    .map((r) => ({ endpoint: String(r["endpoint"]), step: num(r["step"]), n: num(r["n"]) }));
  const allTime = sql
    .exec("SELECT metric, n FROM stats_total")
    .toArray()
    .map((r) => ({ metric: String(r["metric"]), n: num(r["n"]) }));
  const events: LoggedEvent[] = sql
    .exec("SELECT at, kind, line FROM stats_log WHERE at >= ? ORDER BY seq DESC LIMIT ?", bucketStarts(w)[0] ?? "", EVENTS_SHOWN)
    .toArray()
    .map((r) => ({ at: String(r["at"]), kind: String(r["kind"]) as StatEventKind, line: String(r["line"]) }));
  return aggregate({ window: w, rows, latency, allTime, events, since: metaGet(sql, "since"), budget: budgetToday(sql, usage, now) });
}
