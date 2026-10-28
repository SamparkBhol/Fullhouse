export interface BurstResult {
  ok: boolean;
  retryAfterS: number;
}

// A fixed window per address, kept in the isolate's memory. It stops a tight loop without a
// Durable Object call per request; the edge cache already keeps polling away from the Meter.
export class BurstLimiter {
  private readonly seen = new Map<string, { start: number; n: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  take(key: string, now: number): BurstResult {
    const s = this.seen.get(key);
    if (!s || now - s.start >= this.windowMs) {
      if (!s && this.seen.size >= this.maxKeys) this.sweep(now);
      this.seen.set(key, { start: now, n: 1 });
      return { ok: true, retryAfterS: 0 };
    }
    if (s.n >= this.max) return { ok: false, retryAfterS: Math.max(1, Math.ceil((s.start + this.windowMs - now) / 1000)) };
    s.n += 1;
    return { ok: true, retryAfterS: 0 };
  }

  private sweep(now: number): void {
    for (const [k, v] of this.seen) if (now - v.start >= this.windowMs) this.seen.delete(k);
    if (this.seen.size >= this.maxKeys) this.seen.clear();
  }
}
