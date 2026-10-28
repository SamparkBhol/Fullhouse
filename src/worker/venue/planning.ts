import type { Qloo } from "../../core/index.ts";
import type { NightPlan, StreetRead, Venue } from "../../shared/contract.ts";
import type { VenueDeps } from "./api.ts";
import type { VenueRecords } from "./records.ts";

export async function withCopy(deps: VenueDeps, plan: NightPlan, venue: Venue, read: StreetRead): Promise<NightPlan> {
  try {
    return await deps.core.writeCopy(plan, venue, read, deps.generate);
  } catch (err) {
    console.warn("writeCopy failed, keeping template copy", err instanceof Error ? err.message : String(err));
    return plan;
  }
}

// The previous read lets the street read report how each pick moved since then.
export async function freshRead(records: VenueRecords, deps: VenueDeps, q: Qloo, venue: Venue): Promise<StreetRead> {
  const previous = await records.read();
  const read = await deps.core.readStreet(q, venue, previous ? { previous } : {});
  await records.store.put("read", read);
  return read;
}
