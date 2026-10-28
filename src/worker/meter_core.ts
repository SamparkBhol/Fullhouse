import type { Store } from "./store.ts";
import { secondsToUtcMidnight, utcDay } from "./zones.ts";

export type LimitKind = "create" | "search" | "rsvp" | "rsvp_night" | "baseline" | "read" | "plan" | "report";

export const IP_LIMITS: Record<LimitKind, number> = {
  create: 20,
  search: 120,
  rsvp: 60,
  rsvp_night: 3,
  baseline: 10,
  read: 30,
  plan: 60,
  report: 10,
};

// New sign ups can spend only this share of the daily budget, so they never starve venues that already run.
export const NEW_VENUE_SHARE = 0.8;

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
  spend(calls: number, established?: boolean): Promise<boolean>;
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

  async spend(calls: number, established = false): Promise<boolean> {
    if (!Number.isFinite(calls) || calls <= 0) return true;
    await this.today();
    const used = (await this.store.get<number>("qloo")) ?? 0;
    const cap = established ? this.budget : Math.floor(this.budget * NEW_VENUE_SHARE);
    if (used + calls > cap) return false;
    await this.store.put("qloo", used + calls);
    return true;
  }

  // Calls a request set aside and never used go back to the day they were taken from, never to a later one.
  async refund(calls: number, day: string): Promise<void> {
    if (!Number.isFinite(calls) || calls <= 0 || (await this.today()) !== day) return;
    const used = (await this.store.get<number>("qloo")) ?? 0;
    await this.store.put("qloo", Math.max(0, used - Math.floor(calls)));
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
