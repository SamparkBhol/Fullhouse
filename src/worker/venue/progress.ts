import type { Qloo } from "../../core/index.ts";
import { listedPoints } from "../../core/street/steps/loved_places.ts";
import type { ProgressPlace, RunProgress } from "../../shared/contract.ts";

// The Qloo calls finished since the owner last asked for a read or a plan, so the screens tick a line only when
// the server step behind it is done. It lives on the venue's Durable Object and is never stored.
export class Progress {
  private done: string[] = [];
  private since: string | null = null;
  private places: ProgressPlace[] | null = null;
  private partnerId: string | null = null;

  start(now: Date): void {
    this.done = [];
    this.since = now.toISOString();
    this.places = null;
    this.partnerId = null;
  }

  mark(call: string, body?: unknown, params?: Record<string, string | string[]>): void {
    this.done.push(call);
    const one = (k: string) => {
      const v = params?.[k];
      return typeof v === "string" ? v : null;
    };
    const venueId = one("signal.interests.entities");
    const partnerId = one("b.signal.interests.entities");
    if (call === "loved_places" && venueId) this.places = listedPoints(body, venueId);
    if (call === "compare" && partnerId && !this.partnerId) this.partnerId = partnerId;
  }

  view(): RunProgress {
    const out: RunProgress = { since: this.since, done: [...this.done] };
    if (this.places) out.places = this.places;
    if (this.partnerId) out.partnerId = this.partnerId;
    return out;
  }
}

export function tracked(q: Qloo, progress: Progress): Qloo {
  return {
    ...q,
    async get(call, path, params) {
      const res = await q.get(call, path, params);
      progress.mark(call, res.body, params);
      return res;
    },
  };
}
