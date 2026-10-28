import type { VenueDeps } from "./api.ts";
import type { VenueRecords } from "./records.ts";

const HOUR_MS = 3_600_000;

export async function armAlarm(records: VenueRecords, deps: VenueDeps, tz: string): Promise<number> {
  const now = deps.now();
  let next = deps.core.nextMondayNine(tz, now).getTime();
  if (!Number.isFinite(next) || next <= now.getTime() + 60_000) {
    next = deps.core.nextMondayNine(tz, new Date(now.getTime() + HOUR_MS)).getTime();
  }
  await records.store.setAlarm(next);
  return next;
}
