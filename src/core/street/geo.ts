export function roundDistance(m: number): number {
  if (m < 100) return Math.max(10, Math.round(m / 10) * 10);
  return Math.round(m / 50) * 50;
}

export function describeDistance(m: number): string {
  const r = roundDistance(m);
  if (r < 1000) return `about ${r} m`;
  // Past 100 km a tenth of a kilometre is noise, so the figure is whole kilometres.
  return r < 100_000 ? `about ${(r / 1000).toFixed(1)} km` : `about ${Math.round(r / 1000).toLocaleString("en-US")} km`;
}
