import { metresBetween, offset, type Point } from "../geo.ts";
import type { Query } from "../params.ts";
import { wkt } from "../params.ts";
import { between, round } from "../seed.ts";
import type { PlaceRegistry } from "../world/registry.ts";
import { invalid, ok, type Answer } from "./answer.ts";
import { heatCell, insightsEnvelope } from "./render.ts";

const STEP_M = 250;

function grid(center: Point, radius: number): Point[] {
  const out: Point[] = [];
  const n = Math.floor(radius / STEP_M);
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const p = offset(center, i * STEP_M, j * STEP_M);
      if (metresBetween(center, p) <= radius) out.push(p);
    }
  }
  return out;
}

// Taste is strongest near the signal's own place and fades with distance; street tags compress the rank to about 0.6 to 1.
export function heatmap(q: Query, places: PlaceRegistry): Answer {
  const center = wkt(q, "filter.location");
  if (!center) return invalid("filter.location is required for heatmap insights", "filter.location");
  const ids = q.list("signal.interests.entities");
  const tags = q.list("signal.interests.tags");
  if (!ids.length && !tags.length) return invalid("signal.interests.entities or signal.interest.tags is required for heatmap insights");
  const radius = Math.min(5000, Number(q.one("filter.location.radius") ?? "1000") || 1000);
  const focus = (ids[0] ? places.find(ids[0])?.point : undefined) ?? center;
  const seed = [...ids, ...tags].join(",");
  const cells = grid(center, radius).map((p) => ({ p, raw: Math.exp(-metresBetween(focus, p) / 700) * between(`${seed}|${p.lat},${p.lng}`, 0.7, 1) }));
  const top = Math.max(...cells.map((c) => c.raw));
  const order = [...cells].sort((a, b) => b.raw - a.raw);
  const last = Math.max(1, order.length - 1);
  const rows = order.map((c, i) => {
    const rank = ids.length ? 1 - i / last : 0.6 + 0.4 * (1 - i / last);
    const affinity = round(c.raw / top, 5);
    const popularity = round(between(`pop|${c.p.lat},${c.p.lng}`, 0.001, 1), 6);
    const column = ids.length ? "entity_place" : "tag";
    const own: Record<string, number> = { [`${column}_affinity`]: affinity, [`${column}_affinity_rank`]: round(rank, 5) };
    return heatCell(c.p, { affinity, affinity_rank: round(rank, 5), ...own, popularity });
  });
  return ok(insightsEnvelope("heatmap", rows));
}
