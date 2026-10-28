import type { Qloo, QlooCache, QlooOptions } from "../../core/index.ts";
import type { Env } from "../env.ts";
import type { MeterApi } from "../meter_core.ts";
import type { StatsSink } from "../stats/events.ts";
import { observeQloo } from "../stats/qloo_observer.ts";
import { reservingBudget } from "./budget.ts";

export type CreateQloo = (opts: QlooOptions) => Qloo;

// With a stats sink, calls set aside and not used go back to the Meter with the request's events.
export function buildQloo(env: Env, createQloo: CreateQloo, cache: QlooCache, meter: MeterApi, established = false, stats?: StatsSink): Qloo | null {
  const apiKey = env.QLOO_API_KEY?.trim();
  if (!apiKey) return null;
  const budget = reservingBudget(meter, established);
  const opts: QlooOptions = { apiKey, cache, budget };
  const base = env.QLOO_BASE_URL?.trim();
  if (base) opts.baseUrl = base;
  const q = createQloo(opts);
  if (!stats) return q;
  stats.atEnd(() => {
    const unused = budget.unused();
    return unused ? { kind: "budget_unused", ...unused } : null;
  });
  return observeQloo(q, stats);
}
