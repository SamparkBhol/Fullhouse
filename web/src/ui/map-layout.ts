// Loved places often sit within a few metres of each other and of the venue, so their photo pins would stack.
// Pins that touch are spread on a ring around their group (or around the venue when it is in the group) and the
// map draws a thin line from each moved pin back to its spot. Everything here is in screen pixels at one zoom.

export interface Point {
  x: number;
  y: number;
}

export interface Box extends Point {
  w: number;
  h: number;
}

export const PIN_SIZE = 34;
export const PIN_GAP = 4;

const VENUE = -1;

function overlaps(a: Box, b: Box, gap: number): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap;
}

// Distance from the venue's centre along an angle at which a pin clears the venue square.
function clearOfVenue(venue: Box, angle: number, size: number, gap: number): number {
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const alongX = cos > 1e-9 ? ((venue.w + size) / 2 + gap) / cos : Infinity;
  const alongY = sin > 1e-9 ? ((venue.h + size) / 2 + gap) / sin : Infinity;
  return Math.min(alongX, alongY);
}

function groupsOf(boxes: Box[], venue: Box, gap: number): number[][] {
  const parent = boxes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i] ?? i)));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) if (overlaps(boxes[i]!, boxes[j]!, gap)) parent[find(i)] = find(j);
  }
  const byRoot = new Map<number, number[]>();
  boxes.forEach((_, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) ?? []), i]));
  const groups = [...byRoot.values()];
  return groups.map((g) => (g.some((i) => overlaps(boxes[i]!, venue, gap)) ? [VENUE, ...g] : g));
}

function ring(members: number[], points: Point[], venue: Box, size: number, gap: number): Map<number, Point> {
  const pins = members.filter((m) => m !== VENUE);
  const withVenue = members.includes(VENUE);
  const centre = withVenue
    ? { x: venue.x, y: venue.y }
    : { x: pins.reduce((s, i) => s + points[i]!.x, 0) / pins.length, y: pins.reduce((s, i) => s + points[i]!.y, 0) / pins.length };
  const angleOf = (i: number) => {
    const p = points[i]!;
    return Math.hypot(p.x - centre.x, p.y - centre.y) < 1 ? -Math.PI / 2 : Math.atan2(p.y - centre.y, p.x - centre.x);
  };
  const order = [...pins].sort((a, b) => angleOf(a) - angleOf(b) || a - b);
  const step = (2 * Math.PI) / order.length;
  const start = angleOf(order[0]!);
  const angles = order.map((_, k) => start + k * step);
  // Neighbours on the ring sit a diagonal apart, which clears two squares at any angle; the small margin covers rounding.
  const spacing = order.length > 1 ? (((size + gap) * Math.SQRT2) / 2 / Math.sin(Math.PI / order.length)) * 1.02 : 0;
  const radius = Math.max(spacing, ...(withVenue ? angles.map((a) => clearOfVenue(venue, a, size, gap) * 1.02) : [0]));
  const out = new Map<number, Point>();
  order.forEach((i, k) => out.set(i, { x: centre.x + radius * Math.cos(angles[k]!), y: centre.y + radius * Math.sin(angles[k]!) }));
  return out;
}

function placeAll(groups: number[][], points: Point[], venue: Box, size: number, gap: number): Point[] {
  const placed = points.map((p) => ({ ...p }));
  for (const g of groups) {
    if (g.length < 2) continue;
    for (const [i, p] of ring(g, points, venue, size, gap)) placed[i] = p;
  }
  return placed;
}

function firstClash(groups: number[][], placed: Point[], venue: Box, size: number, gap: number): [number, number] | null {
  const box = (i: number): Box => ({ ...placed[i]!, w: size, h: size });
  for (let a = 0; a < groups.length; a++) {
    const ga = groups[a]!;
    if (!ga.includes(VENUE) && ga.some((i) => i !== VENUE && overlaps(box(i), venue, gap))) return [a, -1];
    for (let b = a + 1; b < groups.length; b++) {
      const gb = groups[b]!;
      if (ga.some((i) => i !== VENUE && gb.some((j) => j !== VENUE && overlaps(box(i), box(j), gap)))) return [a, b];
    }
  }
  return null;
}

// Returns where each pin is drawn, in the order given. Pins that clash after one round are merged into one ring.
export function layoutPins(points: Point[], venue: Box, size = PIN_SIZE, gap = PIN_GAP): Point[] {
  let groups = groupsOf(points.map((p) => ({ ...p, w: size, h: size })), venue, gap);
  let placed = placeAll(groups, points, venue, size, gap);
  for (let round = 0; round <= points.length; round++) {
    const clash = firstClash(groups, placed, venue, size, gap);
    if (!clash) break;
    const [a, b] = clash;
    const merged = b < 0 ? [VENUE, ...groups[a]!] : [...new Set([...groups[a]!, ...groups[b]!])];
    groups = [...groups.filter((_, k) => k !== a && k !== b), merged];
    placed = placeAll(groups, points, venue, size, gap);
  }
  return placed;
}
