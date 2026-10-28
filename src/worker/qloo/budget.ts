import type { MeterApi } from "../meter_core.ts";
import { utcDay } from "../zones.ts";

export interface Reservation {
  (calls: number): Promise<boolean>;
  // Calls set aside and not used yet, with the UTC day they were counted on.
  unused(): { calls: number; day: string } | null;
}

// The meter is asked for calls in chunks so a 30 call read costs a handful of meter round trips, not 30.
// An established venue may draw on the share of the budget that new sign ups cannot reach.
export function reservingBudget(meter: MeterApi, established = false, chunk = 10, now: () => Date = () => new Date()): Reservation {
  let left = 0;
  let day = "";
  const take = async (calls: number): Promise<boolean> => {
    if (calls <= left) {
      left -= calls;
      return true;
    }
    const need = calls - left;
    if (await meter.spend(Math.max(chunk, need), established)) {
      left = Math.max(chunk, need) - need;
      day = utcDay(now());
      return true;
    }
    if (need < chunk && (await meter.spend(need, established))) {
      left = 0;
      return true;
    }
    return false;
  };
  return Object.assign(take, { unused: () => (left > 0 && day ? { calls: left, day } : null) });
}
