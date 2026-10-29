import { haversineM } from "../../../src/shared/geo.ts";
import type { Query } from "../params.ts";
import { takeOf, wkt } from "../params.ts";
import { between } from "../seed.ts";
import { placesAround } from "../world/places.ts";
import type { PlaceRegistry } from "../world/registry.ts";
import { invalid, ok, type Answer } from "./answer.ts";
import { insightsEnvelope, insightsPlace } from "./render.ts";

// With the venue as signal the scores spread and every pick is explained by it; a location alone saturates near 1.
export function placeInsights(q: Query, places: PlaceRegistry): Answer {
  const take = takeOf(q, 20);
  if (take === null) return invalid("take must be an integer value between 1 and 50", "take");
  const ids = q.list("signal.interests.entities");
  const filterPoint = wkt(q, "filter.location");
  const signalPoint = wkt(q, "signal.location");
  if (!ids.length && !filterPoint && !signalPoint) return invalid("at least one valid signal or filter is required for entity insights");
  const center = filterPoint ?? signalPoint ?? (ids[0] ? places.find(ids[0])?.point : undefined);
  if (!center) return ok(insightsEnvelope("entities", []));

  const radius = Number(q.one("filter.location.radius") ?? "0");
  const excluded = new Set(q.list("filter.exclude.entities").map((id) => id.toUpperCase()));
  const explain = q.one("feature.explainability") === "true" && ids.length > 0;
  const signal = ids.join(",");
  const around = places.remember(placesAround(center));
  const aroundIds = new Set(around.map((p) => p.id));
  // With another place as the signal, the venue it sits beside is one of the places its crowd loves.
  const nearby = ids.length && filterPoint ? places.known().filter((p) => !aroundIds.has(p.id) && haversineM(p.point, filterPoint) <= radius) : [];
  const scored = [...around, ...nearby]
    .filter((p) => !filterPoint || haversineM(p.point, filterPoint) <= radius)
    .filter((p) => !excluded.has(p.id.toUpperCase()))
    .map((p) => ({ p, affinity: ids.length ? between(`${signal}|${p.id}`, 0.8, 0.99) : between(`area|${p.id}`, 0.9993, 0.99999) }))
    .sort((a, b) => b.affinity - a.affinity)
    .slice(0, take);
  const rows = scored.map(({ p, affinity }) =>
    insightsPlace(p, { affinity, distance: haversineM(center, p.point), ...(explain ? { explainedBy: ids } : {}) }),
  );
  const body = insightsEnvelope("entities", rows, { ...(explain ? { explained: ids } : {}), located: Boolean(signalPoint) });
  if (q.one("feature.explainability") === "true" && !ids.length) body.warnings = [{ type: "Could not calculate explainability" }];
  return ok(body);
}
