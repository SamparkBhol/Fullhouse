import type { Bounds } from "../geo.ts";
import { HEAT_BUCKETS } from "../heat.ts";

// Warm white for the strongest windows down to a faint amber, the way lamps look through glass from the street.
// Every step stays light, because a dark amber over the blue tiles turns brown.
export const LAMP = ["#FFF3D6", "#FFDF9E", "#FFCF7C", "#FFC266", "#FFB552"];
export const LAMP_OPACITY = [1, 0.72, 0.48, 0.3, 0.18];
export const DARK_WINDOW = "#14233A";
// Windows are drawn smaller than their cell so the street plan shows between them like a facade.
export const WINDOW_FILL_OF_CELL = 0.7;
const CORNER = 0.2;
const ARC_STEPS = 4;

export interface WindowStyle {
  fillColor: string;
  fillOpacity: number;
}

export function lampFor(bucket: number | null): WindowStyle {
  if (bucket === null) return { fillColor: DARK_WINDOW, fillOpacity: 0.55 };
  const b = Math.max(0, Math.min(HEAT_BUCKETS - 1, bucket));
  return { fillColor: LAMP[b] as string, fillOpacity: LAMP_OPACITY[b] as number };
}

// Leaflet draws rectangles with square corners, so a window is a polygon whose corners are short arcs.
export function roundedWindow(b: Bounds): [number, number][] {
  const ry = (b.north - b.south) * CORNER;
  const rx = (b.east - b.west) * CORNER;
  const corners: [number, number, number][] = [
    [b.north - ry, b.east - rx, 0],
    [b.north - ry, b.west + rx, 90],
    [b.south + ry, b.west + rx, 180],
    [b.south + ry, b.east - rx, 270],
  ];
  const out: [number, number][] = [];
  for (const [cy, cx, from] of corners) {
    for (let k = 0; k <= ARC_STEPS; k++) {
      const a = ((from + (90 * k) / ARC_STEPS) * Math.PI) / 180;
      out.push([cy + ry * Math.sin(a), cx + rx * Math.cos(a)]);
    }
  }
  return out;
}
