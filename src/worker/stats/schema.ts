import type { SqlLike } from "../qloo/caches.ts";
import { ALL_TIME_METRICS } from "./counters.ts";

export const RING_SIZE = 200;
export const HOURLY_KEEP_HOURS = 32 * 24;
export const DAILY_KEEP_DAYS = 35;

const TABLES = [
  "CREATE TABLE IF NOT EXISTS stats_hour (h INTEGER NOT NULL, metric TEXT NOT NULL, label TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (h, metric, label))",
  "CREATE TABLE IF NOT EXISTS stats_day (d INTEGER NOT NULL, metric TEXT NOT NULL, label TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (d, metric, label))",
  "CREATE TABLE IF NOT EXISTS stats_total (metric TEXT PRIMARY KEY, n INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS stats_latency_hour (h INTEGER NOT NULL, endpoint TEXT NOT NULL, step INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (h, endpoint, step))",
  "CREATE TABLE IF NOT EXISTS stats_latency_day (d INTEGER NOT NULL, endpoint TEXT NOT NULL, step INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (d, endpoint, step))",
  "CREATE TABLE IF NOT EXISTS stats_log (seq INTEGER PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL, line TEXT NOT NULL, venue TEXT)",
  "CREATE INDEX IF NOT EXISTS stats_log_venue ON stats_log (venue)",
  "CREATE TABLE IF NOT EXISTS stats_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)",
  // Tables from the first stats build: raw latency samples and a log without venue ids, whose lines named any venue.
  "DROP TABLE IF EXISTS stats_latency",
  "DROP TABLE IF EXISTS stats_event",
];

export function ensureStatsTables(sql: SqlLike): void {
  for (const statement of TABLES) sql.exec(statement);
  if (metaGet(sql, "totals") === null) {
    const list = ALL_TIME_METRICS.map((m) => `'${m}'`).join(", ");
    sql.exec(`INSERT OR REPLACE INTO stats_total (metric, n) SELECT metric, SUM(n) FROM stats_day WHERE metric IN (${list}) GROUP BY metric`);
    metaSet(sql, "totals", "1");
  }
}

export function hourOf(ms: number): number {
  return Math.floor(ms / 3_600_000);
}

export function metaGet(sql: SqlLike, k: string): string | null {
  const row = sql.exec("SELECT v FROM stats_meta WHERE k = ?", k).toArray()[0];
  return row ? String(row["v"]) : null;
}

export function metaSet(sql: SqlLike, k: string, v: string): void {
  sql.exec("INSERT INTO stats_meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", k, v);
}
