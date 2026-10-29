import { describe, expect, it } from "vitest";
import { layoutPins, PIN_GAP, PIN_SIZE, type Box, type Point } from "../../web/src/ui/map-layout.ts";

const VENUE: Box = { x: 0, y: 0, w: 40, h: 48 };

function clashes(placed: Point[], venue: Box): string[] {
  const out: string[] = [];
  const reach = PIN_SIZE + PIN_GAP;
  placed.forEach((a, i) => {
    if (Math.abs(a.x - venue.x) < (venue.w + PIN_SIZE) / 2 + PIN_GAP && Math.abs(a.y - venue.y) < (venue.h + PIN_SIZE) / 2 + PIN_GAP) out.push(`${i + 1} on the venue`);
    placed.slice(i + 1).forEach((b, k) => {
      if (Math.abs(a.x - b.x) < reach && Math.abs(a.y - b.y) < reach) out.push(`${i + 1} on ${i + k + 2}`);
    });
  });
  return out;
}

// A small fixed sequence, so the scattered cases are the same on every run.
function scatter(seed: number, n: number, spread: number): Point[] {
  let s = seed;
  const next = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  return Array.from({ length: n }, () => ({ x: (next() - 0.5) * spread, y: (next() - 0.5) * spread }));
}

describe("loved place pins", () => {
  it("leaves pins that are already apart where they are", () => {
    const points = [
      { x: 120, y: -80 },
      { x: -150, y: 60 },
      { x: 40, y: 140 },
    ];
    expect(layoutPins(points, VENUE)).toEqual(points);
  });

  it("spreads pins that sit on the venue and on each other, like the Housing Works read", () => {
    const points = [
      { x: 4, y: -6 },
      { x: 18, y: 10 },
      { x: 90, y: -60 },
      { x: 6, y: -2 },
      { x: -20, y: -20 },
      { x: 2, y: 30 },
      { x: 10, y: 2 },
      { x: 12, y: 30 },
      { x: -40, y: -70 },
      { x: -60, y: -30 },
    ];
    const placed = layoutPins(points, VENUE);
    expect(clashes(placed, VENUE)).toEqual([]);
    // The photo pins are wide enough that the ring round the venue nudges the far pin, but never by more than two pins.
    expect(Math.hypot(placed[2]!.x - points[2]!.x, placed[2]!.y - points[2]!.y)).toBeLessThan(PIN_SIZE * 2);
    for (const [i, p] of placed.entries()) expect(Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y), `pin ${i + 1}`).toBeLessThan(140);
  });

  it("gives every pin its own spot when they all share one point", () => {
    const same = Array.from({ length: 10 }, () => ({ x: 0, y: 0 }));
    expect(clashes(layoutPins(same, VENUE), VENUE)).toEqual([]);
    const elsewhere = Array.from({ length: 4 }, () => ({ x: 300, y: 300 }));
    const placed = layoutPins(elsewhere, VENUE);
    expect(clashes(placed, VENUE)).toEqual([]);
    for (const p of placed) expect(Math.hypot(p.x - 300, p.y - 300)).toBeLessThan(60);
  });

  it("never leaves two pins or a pin and the venue on top of each other", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const placed = layoutPins(scatter(seed, 10, 160), VENUE);
      expect(clashes(placed, VENUE), `seed ${seed}`).toEqual([]);
    }
  });

  it("lays out the same way every time", () => {
    const points = scatter(7, 10, 90);
    expect(layoutPins(points, VENUE)).toEqual(layoutPins(points, VENUE));
  });
});
