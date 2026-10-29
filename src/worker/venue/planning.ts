import type { Qloo } from "../../core/index.ts";
import type { EntityRef, NightPlan, StreetRead, Venue } from "../../shared/contract.ts";
import { recordEvent } from "../stats/events.ts";
import { readEvent } from "../stats/makers.ts";
import type { VenueDeps } from "./api.ts";
import { tracked } from "./progress.ts";
import type { VenueRecords } from "./records.ts";

const DAY_MS = 86_400_000;
const ESTABLISHED_DAYS = 7;
const REPEAT_WEEKS = 8;
export const FRESH_READS_PER_DAY = 3;

export async function withCopy(deps: VenueDeps, plan: NightPlan, venue: Venue, read: StreetRead): Promise<NightPlan> {
  try {
    return await deps.core.writeCopy(plan, venue, read, deps.generate);
  } catch (err) {
    console.warn("writeCopy failed, keeping template copy", err instanceof Error ? err.message : String(err));
    return plan;
  }
}

export function qlooFor(deps: VenueDeps, venue: Venue): Qloo | null {
  const q = deps.qloo(deps.now().getTime() - Date.parse(venue.createdAt) >= ESTABLISHED_DAYS * DAY_MS);
  return q && deps.progress ? tracked(q, deps.progress) : q;
}

// The features of nights from the last eight weeks go to Qloo as exclusions, so the next read brings new picks.
export async function recentFeatures(records: VenueRecords, now: Date): Promise<EntityRef[]> {
  const since = new Date(now.getTime() - REPEAT_WEEKS * 7 * DAY_MS).toISOString().slice(0, 10);
  const out: EntityRef[] = [];
  for (const { night } of await records.nights()) {
    const f = night.feature;
    if (f && night.date >= since && !out.some((o) => o.id === f.id)) out.push({ id: f.id, name: f.name, type: f.type });
  }
  return out;
}

// Each fresh read an owner asks for counts toward a small daily allowance per venue; the Monday run does not.
export async function takeReadSlot(records: VenueRecords, day: string): Promise<boolean> {
  const key = `reads:${day}`;
  const done = (await records.store.get<number>(key)) ?? 0;
  if (done >= FRESH_READS_PER_DAY) return false;
  await records.store.put(key, done + 1);
  return true;
}

// The previous read lets the street read report how each pick moved since then.
export async function freshRead(records: VenueRecords, deps: VenueDeps, q: Qloo, venue: Venue): Promise<StreetRead> {
  const previous = await records.read();
  const exclude = await recentFeatures(records, deps.now());
  const read = await deps.core.readStreet(q, venue, { ...(previous ? { previous } : {}), ...(exclude.length ? { exclude } : {}) });
  await records.store.put("read", read);
  recordEvent(deps.stats, readEvent(venue, read));
  return read;
}
