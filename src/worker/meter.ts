import { DurableObject } from "cloudflare:workers";
import { dailyBudgetOf, type Env } from "./env.ts";
import { MeterCore, type HitResult, type LimitKind, type MeterApi, type MeterUsage } from "./meter_core.ts";
import { doStore } from "./store.ts";

export class Meter extends DurableObject<Env> implements MeterApi {
  private readonly core: MeterCore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.core = new MeterCore(doStore(ctx.storage), dailyBudgetOf(env));
  }

  spend(calls: number): Promise<boolean> {
    return this.core.spend(calls);
  }

  hit(key: string, kind: LimitKind): Promise<HitResult> {
    return this.core.hit(key, kind);
  }

  usage(): Promise<MeterUsage> {
    return this.core.usage();
  }
}
