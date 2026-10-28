import type { StatsBody, StatsRange } from "../../shared/stats.ts";
import type { MeterUsage } from "../meter_core.ts";
import type { SqlLike } from "../qloo/caches.ts";
import type { StatsApi } from "./buffer.ts";
import type { StampedEvent } from "./events.ts";
import { readStats } from "./reader.ts";
import { ensureStatsTables, hourOf } from "./schema.ts";
import { writeEvents } from "./writer.ts";

const MAX_BATCH = 400;

// The Meter's stats: counters per hour and per day, latency steps and the event log, in the Meter's SQLite.
// An answer is kept until something is recorded, the budget moves or the hour turns, so idle polling reads no rows.
export class StatsCore implements StatsApi {
  private ready = false;
  private version = 0;
  private readonly kept = new Map<StatsRange, { body: StatsBody; hour: number; version: number }>();

  constructor(
    private readonly sql: SqlLike,
    private readonly usage: () => Promise<MeterUsage>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private tables(): void {
    if (this.ready) return;
    ensureStatsTables(this.sql);
    this.ready = true;
  }

  changed(): void {
    this.version += 1;
  }

  async record(events: StampedEvent[]): Promise<void> {
    if (!Array.isArray(events) || !events.length) return;
    this.tables();
    const valid = events.filter((e) => e && typeof e.kind === "string" && typeof e.at === "string").slice(0, MAX_BATCH);
    writeEvents(this.sql, valid, this.now());
    this.changed();
  }

  async stats(range: StatsRange): Promise<StatsBody> {
    this.tables();
    const now = this.now();
    const hour = hourOf(now.getTime());
    const held = this.kept.get(range);
    if (held && held.hour === hour && held.version === this.version) return held.body;
    const version = this.version;
    const body = readStats(this.sql, range, now, await this.usage());
    this.kept.set(range, { body, hour, version });
    return body;
  }
}
