import type { Store } from "./store.ts";
import { secondsToUtcMidnight, utcDay } from "./zones.ts";

export type LimitKind = "create" | "search" | "rsvp" | "baseline";

export const IP_LIMITS: Record<LimitKind, number> = {
  create: 20,
  search: 120,
  rsvp: 60,
  baseline: 10,
};

export interface HitResult {
  ok: boolean;
  remaining: number;
  retryAfterS: number;
}

export interface MeterUsage {
  day: string;
  qlooCalls: number;
  qlooBudget: number;
}

export interface MeterApi {
  spend(calls: number): Promise<boolean>;
  hit(key: string, kind: LimitKind): Promise<HitResult>;
  usage(): Promise<MeterUsage>;
}

export class MeterCore implements MeterApi {
  constructor(
    private readonly store: Store,
    private readonly budget: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async today(): Promise<string> {
    const day = utcDay(this.now());
    const stored = await this.store.get<string>("day");
    if (stored !== day) {
      await this.store.deleteAll();
      await this.store.put("day", day);
    }
    return day;
  }

  async spend(calls: number): Promise<boolean> {
    if (!Number.isFinite(calls) || calls <= 0) return true;
    await this.today();
    const used = (await this.store.get<number>("qloo")) ?? 0;
    if (used + calls > this.budget) return false;
    await this.store.put("qloo", used + calls);
    return true;
  }

  async hit(key: string, kind: LimitKind): Promise<HitResult> {
    await this.today();
    const limit = IP_LIMITS[kind];
    const k = `ip:${kind}:${key}`;
    const used = (await this.store.get<number>(k)) ?? 0;
    if (used >= limit) return { ok: false, remaining: 0, retryAfterS: secondsToUtcMidnight(this.now()) };
    await this.store.put(k, used + 1);
    return { ok: true, remaining: limit - used - 1, retryAfterS: 0 };
  }

  async usage(): Promise<MeterUsage> {
    const day = await this.today();
    return { day, qlooCalls: (await this.store.get<number>("qloo")) ?? 0, qlooBudget: this.budget };
  }
}
