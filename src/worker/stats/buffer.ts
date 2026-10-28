import type { StatsBody, StatsRange } from "../../shared/stats.ts";
import type { StampedEvent, StatEvent, StatsSink } from "./events.ts";

// A read makes about 30 Qloo calls; the cap only guards against a runaway loop.
const MAX_EVENTS = 400;

export interface StatsApi {
  record(events: StampedEvent[]): Promise<void>;
  stats(range: StatsRange): Promise<StatsBody>;
}

// Events wait here for the end of the request, so a whole street read reaches the Meter in one call
// instead of spending one subrequest per Qloo call.
export class StatsBuffer implements StatsSink {
  private events: StampedEvent[] = [];
  private last: (() => StatEvent | null)[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  add(event: StatEvent): void {
    if (this.events.length < MAX_EVENTS) this.events.push({ ...event, at: this.now().toISOString() });
  }

  atEnd(last: () => StatEvent | null): void {
    this.last.push(last);
  }

  take(): StampedEvent[] {
    for (const last of this.last) {
      const event = last();
      if (event) this.add(event);
    }
    this.last = [];
    const out = this.events;
    this.events = [];
    return out;
  }
}

export async function sendStats(events: StampedEvent[], target: Pick<StatsApi, "record"> | null): Promise<void> {
  if (!events.length || !target) return;
  try {
    await target.record(events);
  } catch (err) {
    console.warn("stats not recorded", err instanceof Error ? err.message : String(err));
  }
}
