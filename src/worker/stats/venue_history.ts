import type { DashboardRead, MondayProposal } from "../../shared/stats.ts";
import type { Store } from "../store.ts";
import { sendStats, type StatsApi, type StatsBuffer } from "./buffer.ts";
import type { StampedEvent } from "./events.ts";

const READS_KEY = "history:reads";
const MONDAYS_KEY = "history:mondays";
const KEEP = 52;

export interface MondayEntry {
  at: string;
  planned: boolean;
  proposal?: MondayProposal;
}

type ReadEvent = Extract<StampedEvent, { kind: "street_read" }>;
type MondayEvent = Extract<StampedEvent, { kind: "monday_run" }>;

async function append<T>(store: Store, key: string, items: T[]): Promise<void> {
  if (!items.length) return;
  const kept = (await store.get<T[]>(key)) ?? [];
  await store.put(key, [...kept, ...items].slice(-KEEP));
}

// Each venue keeps its own read and Monday history next to its nights, so deleting the venue deletes it too.
export async function keepVenueHistory(store: Store, events: StampedEvent[]): Promise<void> {
  const reads = events.filter((e): e is ReadEvent => e.kind === "street_read").map((e) => ({ at: e.at, calls: e.calls, cached: e.cached }));
  const mondays = events
    .filter((e): e is MondayEvent => e.kind === "monday_run")
    .map((e): MondayEntry => (e.proposal ? { at: e.at, planned: e.planned, proposal: e.proposal } : { at: e.at, planned: e.planned }));
  await append<DashboardRead>(store, READS_KEY, reads);
  await append<MondayEntry>(store, MONDAYS_KEY, mondays);
}

export async function venueHistory(store: Store): Promise<{ reads: DashboardRead[]; mondays: MondayEntry[] }> {
  const [reads, mondays] = await Promise.all([store.get<DashboardRead[]>(READS_KEY), store.get<MondayEntry[]>(MONDAYS_KEY)]);
  return { reads: reads ?? [], mondays: mondays ?? [] };
}

// The venue's own history is written before the answer goes back. With a way to finish later, the Meter gets the
// events after the answer, so the owner and guests never wait on the one Meter all venues share.
export async function settleVenueStats(
  buffer: StatsBuffer,
  store: Store,
  target: Pick<StatsApi, "record"> | null,
  later?: (work: Promise<void>) => void,
): Promise<void> {
  const events = buffer.take();
  if (!events.length) return;
  try {
    await keepVenueHistory(store, events);
  } catch (err) {
    console.warn("venue history not kept", err instanceof Error ? err.message : String(err));
  }
  const sent = sendStats(events, target);
  if (later) later(sent);
  else await sent;
}
