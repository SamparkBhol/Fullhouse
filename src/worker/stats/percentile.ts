// Latency is kept as counts per step rather than raw samples, so every call counts and a long range reads a few rows.
// A call lands on the first step at or above its time; the client gives up long before the last step.
export const LATENCY_STEPS_MS: readonly number[] = [
  10, 20, 30, 40, 50, 75, 100, 150, 200, 250, 300, 400, 500, 600, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 6000, 8000,
];

export function stepOf(ms: number): number {
  const i = LATENCY_STEPS_MS.findIndex((top) => ms <= top);
  return i < 0 ? LATENCY_STEPS_MS.length - 1 : i;
}

export interface StepCount {
  step: number;
  n: number;
}

// Nearest rank over the steps: the step that holds the call at rank p percent, reported as that step's top.
export function percentile(counts: readonly StepCount[], p: number): number | null {
  const sorted = counts.filter((c) => c.n > 0 && LATENCY_STEPS_MS[c.step] !== undefined).sort((a, b) => a.step - b.step);
  const total = sorted.reduce((sum, c) => sum + c.n, 0);
  if (!total) return null;
  const rank = Math.min(total, Math.max(1, Math.ceil((p / 100) * total)));
  let seen = 0;
  for (const c of sorted) {
    seen += c.n;
    if (seen >= rank) return LATENCY_STEPS_MS[c.step] ?? null;
  }
  return null;
}

export function latencySummary(counts: readonly StepCount[]): { p50: number | null; p95: number | null; samples: number } {
  return { p50: percentile(counts, 50), p95: percentile(counts, 95), samples: counts.reduce((sum, c) => sum + Math.max(0, c.n), 0) };
}
