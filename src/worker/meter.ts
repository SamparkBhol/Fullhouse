import { DurableObject } from "cloudflare:workers";
import type { StatsBody, StatsRange } from "../shared/stats.ts";
import { dailyBudgetOf, type Env } from "./env.ts";
import { MeterCore, type HitResult, type LimitKind, type MeterApi, type MeterUsage } from "./meter_core.ts";
import type { SqlLike } from "./qloo/caches.ts";
import type { StatsApi } from "./stats/buffer.ts";
import { StatsCore } from "./stats/core.ts";
import type { StampedEvent } from "./stats/events.ts";
import { doStore, type Store } from "./store.ts";

// deleteAll on a SQLite backed object also drops its SQL tables, so the daily reset clears only the
// key value entries and the stats tables survive midnight.
function keysOnly(storage: DurableObjectStorage): Store {
  return {
    ...doStore(storage),
    async deleteAll() {
      const keys = [...(await storage.list()).keys()];
      for (let i = 0; i < keys.length; i += 128) await storage.delete(keys.slice(i, i + 128));
    },
  };
}

export class Meter extends DurableObject<Env> implements MeterApi, StatsApi {
  private readonly core: MeterCore;
  private readonly statsCore: StatsCore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.core = new MeterCore(keysOnly(ctx.storage), dailyBudgetOf(env));
    this.statsCore = new StatsCore(ctx.storage.sql as unknown as SqlLike, () => this.core.usage());
  }

  async spend(calls: number, established?: boolean): Promise<boolean> {
    const ok = await this.core.spend(calls, established);
    if (ok) this.statsCore.changed();
    return ok;
  }

  hit(key: string, kind: LimitKind): Promise<HitResult> {
    return this.core.hit(key, kind);
  }

  usage(): Promise<MeterUsage> {
    return this.core.usage();
  }

  async record(events: StampedEvent[]): Promise<void> {
    if (!Array.isArray(events)) return;
    for (const e of events) if (e?.kind === "budget_unused") await this.core.refund(e.calls, e.day);
    await this.statsCore.record(events);
  }

  stats(range: StatsRange): Promise<StatsBody> {
    return this.statsCore.stats(range);
  }
}
