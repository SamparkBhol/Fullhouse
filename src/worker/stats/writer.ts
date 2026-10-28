import type { SqlLike } from "../qloo/caches.ts";
import { ALL_TIME_METRICS, incrementsFor, mergeIncrements, type Increment } from "./counters.ts";
import type { StampedEvent } from "./events.ts";
import { logLines } from "./lines.ts";
import { stepOf } from "./percentile.ts";
import { DAILY_KEEP_DAYS, HOURLY_KEEP_HOURS, RING_SIZE, hourOf, metaGet, metaSet } from "./schema.ts";

const ALL_TIME = new Set<string>(ALL_TIME_METRICS);

function bump(sql: SqlLike, hour: number, i: Increment): void {
  sql.exec(
    "INSERT INTO stats_hour (h, metric, label, n) VALUES (?, ?, ?, ?) ON CONFLICT (h, metric, label) DO UPDATE SET n = n + excluded.n",
    hour,
    i.metric,
    i.label,
    i.n,
  );
  sql.exec(
    "INSERT INTO stats_day (d, metric, label, n) VALUES (?, ?, ?, ?) ON CONFLICT (d, metric, label) DO UPDATE SET n = n + excluded.n",
    Math.floor(hour / 24),
    i.metric,
    i.label,
    i.n,
  );
  if (ALL_TIME.has(i.metric)) {
    sql.exec("INSERT INTO stats_total (metric, n) VALUES (?, ?) ON CONFLICT (metric) DO UPDATE SET n = n + excluded.n", i.metric, i.n);
  }
}

// A turnout correction is counted in the hour the night was first counted, so no range ever sums below zero.
function countedAt(e: StampedEvent): number {
  const first = e.kind === "turnout" && e.firstAt ? Date.parse(e.firstAt) : NaN;
  return hourOf(Number.isFinite(first) ? first : Date.parse(e.at));
}

// Every live call counts toward its endpoint's latency steps, by hour for 24 hours and 7 days and by day for 30 days.
function keepLatency(sql: SqlLike, events: StampedEvent[]): void {
  const steps = new Map<string, { hour: number; endpoint: string; step: number; n: number }>();
  for (const e of events) {
    if (e.kind !== "qloo_call" || e.cached || !(e.ms > 0)) continue;
    const hour = hourOf(Date.parse(e.at));
    const step = stepOf(e.ms);
    const key = `${hour} ${step} ${e.endpoint}`;
    const held = steps.get(key);
    if (held) held.n += 1;
    else steps.set(key, { hour, endpoint: e.endpoint, step, n: 1 });
  }
  for (const s of steps.values()) {
    sql.exec(
      "INSERT INTO stats_latency_hour (h, endpoint, step, n) VALUES (?, ?, ?, ?) ON CONFLICT (h, endpoint, step) DO UPDATE SET n = n + excluded.n",
      s.hour,
      s.endpoint,
      s.step,
      s.n,
    );
    sql.exec(
      "INSERT INTO stats_latency_day (d, endpoint, step, n) VALUES (?, ?, ?, ?) ON CONFLICT (d, endpoint, step) DO UPDATE SET n = n + excluded.n",
      Math.floor(s.hour / 24),
      s.endpoint,
      s.step,
      s.n,
    );
  }
}

function keepLog(sql: SqlLike, events: StampedEvent[]): void {
  const lines = logLines(events);
  if (!lines.length) return;
  for (const l of lines) sql.exec("INSERT INTO stats_log (at, kind, line, venue) VALUES (?, ?, ?, ?)", l.at, l.kind, l.line, l.venue);
  sql.exec("DELETE FROM stats_log WHERE seq <= (SELECT MAX(seq) FROM stats_log) - ?", RING_SIZE);
}

// Runs after the batch's own lines are in, so a venue deleted in the same request leaves nothing behind.
function forgetVenues(sql: SqlLike, events: StampedEvent[]): void {
  for (const e of events) {
    if (e.kind !== "forget_venue") continue;
    if (e.lines === "all") sql.exec("DELETE FROM stats_log WHERE venue = ?", e.venueId);
    else sql.exec("DELETE FROM stats_log WHERE venue = ? AND kind IN ('night_published', 'rsvp')", e.venueId);
  }
}

function prune(sql: SqlLike, hour: number): void {
  if (metaGet(sql, "pruned") === String(hour)) return;
  const day = Math.floor(hour / 24);
  sql.exec("DELETE FROM stats_hour WHERE h < ?", hour - HOURLY_KEEP_HOURS);
  sql.exec("DELETE FROM stats_latency_hour WHERE h < ?", hour - HOURLY_KEEP_HOURS);
  sql.exec("DELETE FROM stats_day WHERE d < ?", day - DAILY_KEEP_DAYS);
  sql.exec("DELETE FROM stats_latency_day WHERE d < ?", day - DAILY_KEEP_DAYS);
  metaSet(sql, "pruned", String(hour));
}

export function writeEvents(sql: SqlLike, events: StampedEvent[], now: Date): void {
  const valid = events.filter((e) => Number.isFinite(Date.parse(e.at)));
  if (!valid.length) return;
  const first = valid.find((e) => e.kind !== "forget_venue" && e.kind !== "budget_unused");
  if (first && metaGet(sql, "since") === null) metaSet(sql, "since", first.at);
  const byHour = new Map<number, Increment[]>();
  for (const e of valid) {
    const hour = countedAt(e);
    byHour.set(hour, [...(byHour.get(hour) ?? []), ...incrementsFor(e)]);
  }
  for (const [hour, list] of byHour) for (const i of mergeIncrements(list)) bump(sql, hour, i);
  keepLatency(sql, valid);
  keepLog(sql, valid);
  forgetVenues(sql, valid);
  prune(sql, hourOf(now.getTime()));
}
