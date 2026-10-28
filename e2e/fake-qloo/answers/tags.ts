import type { Query } from "../params.ts";
import { takeOf, wkt } from "../params.ts";
import { shuffled } from "../seed.ts";
import type { PlaceRegistry } from "../world/registry.ts";
import { AUDIENCE_TAGS, STREET_TAGS, diversify, inNamespaces, type TagDef } from "../world/tags.ts";
import { invalid, ok, type Answer } from "./answer.ts";
import { insightsEnvelope, tagModeRow } from "./render.ts";

function perSubtype(q: Query): number {
  if (q.one("diversify.by") !== "subtype") return Number.POSITIVE_INFINITY;
  const n = Number(q.one("diversify.take") ?? "5");
  return Number.isInteger(n) && n > 0 ? n : 5;
}

// An entity signal leads with the place's own tags and spreads its scores; a location signal scores almost level.
export function tagInsights(q: Query, places: PlaceRegistry): Answer {
  const raw = q.one("filter.tag.types");
  const namespaces = q.list("filter.tag.types");
  if (raw !== undefined && !namespaces.length) return invalid("filter.tag.types must be an array of at least one element", "filter.tag.types");
  const take = takeOf(q, 20);
  if (take === null) return invalid("take must be an integer value between 1 and 50", "take");
  const ids = q.list("signal.interests.entities");
  const point = wkt(q, "signal.location");
  if (!ids.length && !point) return invalid("at least one valid signal or filter is required for tag insights");

  let pool: TagDef[];
  if (ids.length) {
    const own = ids.flatMap((id) => places.find(id)?.tags ?? []).filter((t) => t.id !== t.namespace);
    const rest = shuffled(AUDIENCE_TAGS, `audience|${ids.join(",")}`);
    pool = [...own, ...rest].filter((t, i, all) => all.findIndex((o) => o.id === t.id) === i);
  } else {
    pool = shuffled(STREET_TAGS, `street|${point?.lat.toFixed(3)},${point?.lng.toFixed(3)}`);
  }
  const picked = diversify(inNamespaces(pool, namespaces), perSubtype(q)).slice(0, take);
  const rows = picked.map((t, i) =>
    ids.length ? tagModeRow(t, 0.9995 - i * 0.004, 0.999 - i * 0.002) : tagModeRow(t, 0.99998 - i * 0.00002, 0.99991 - i * 0.00001),
  );
  return ok(insightsEnvelope("tags", rows, { located: !ids.length }));
}
