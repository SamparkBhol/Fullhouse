import type { Qloo } from "../../core/index.ts";
import type { RunProgress } from "../../shared/contract.ts";

// The Qloo calls finished since the owner last asked for a read or a plan, so the screens tick a line only when
// the server step behind it is done. It lives on the venue's Durable Object and is never stored.
export class Progress {
  private done: string[] = [];
  private since: string | null = null;

  start(now: Date): void {
    this.done = [];
    this.since = now.toISOString();
  }

  mark(call: string): void {
    this.done.push(call);
  }

  view(): RunProgress {
    return { since: this.since, done: [...this.done] };
  }
}

export function tracked(q: Qloo, progress: Progress): Qloo {
  return {
    ...q,
    async get(call, path, params) {
      const res = await q.get(call, path, params);
      progress.mark(call);
      return res;
    },
  };
}
