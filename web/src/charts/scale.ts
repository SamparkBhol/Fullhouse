// The largest value rounded up to a tidy step, so the top gridline label reads like a person wrote it.
// Steps are chosen so the half way gridline is a whole number too.
export function niceMax(max: number): number {
  if (max <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(max));
  const steps = step === 1 ? [2, 4, 6, 8, 10] : [1, 2, 3, 4, 5, 6, 8, 10];
  for (const m of steps) if (m * step >= max) return m * step;
  return 10 * step;
}
