// Streets are not straight lines, so the straight distance gets 30% added for corners, walked at 80 m a minute.
export const DETOUR = 1.3;
export const WALK_M_PER_MIN = 80;

export function walkMinutes(distanceM: number): number {
  return Math.max(1, Math.round((distanceM * DETOUR) / WALK_M_PER_MIN));
}

export function walkText(distanceM: number): string {
  const n = walkMinutes(distanceM);
  return `about ${n} minute${n === 1 ? "" : "s"} on foot`;
}
