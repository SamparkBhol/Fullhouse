import { DatabaseSync } from "node:sqlite";
import type { SqlLike } from "../../../src/worker/qloo/caches.ts";
import { StatsCore } from "../../../src/worker/stats/core.ts";
import type { StampedEvent, StatEvent } from "../../../src/worker/stats/events.ts";
import type { MeterUsage } from "../../../src/worker/meter_core.ts";

type Value = string | number | null;

// The same exec shape as a Durable Object's ctx.storage.sql, on Node's built in SQLite.
export function memorySql(): SqlLike & { db: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  return {
    db,
    exec(query: string, ...bindings: unknown[]) {
      const stmt = db.prepare(query);
      const args = bindings as Value[];
      if (/^\s*select/i.test(query)) {
        const rows = stmt.all(...args) as Record<string, unknown>[];
        return { toArray: () => rows };
      }
      stmt.run(...args);
      return { toArray: () => [] };
    },
  };
}

export function clock(start: string) {
  let t = Date.parse(start);
  return { now: () => new Date(t), set: (iso: string) => (t = Date.parse(iso)), advance: (ms: number) => (t += ms) };
}

export const USAGE: MeterUsage = { day: "2026-10-27", qlooCalls: 30, qlooBudget: 4000 };

export function statsCore(now: () => Date, usage: MeterUsage = USAGE) {
  const sql = memorySql();
  return { sql, core: new StatsCore(sql, async () => usage, now) };
}

export function at(iso: string, e: StatEvent): StampedEvent {
  return { ...e, at: iso };
}
