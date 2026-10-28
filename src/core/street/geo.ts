export function roundDistance(m: number): number {
  if (m < 100) return Math.max(10, Math.round(m / 10) * 10);
  return Math.round(m / 50) * 50;
}

export function describeDistance(m: number): string {
  const r = roundDistance(m);
  return r < 1000 ? `about ${r} m` : `about ${(r / 1000).toFixed(1)} km`;
}
