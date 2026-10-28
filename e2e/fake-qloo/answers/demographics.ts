import type { Query } from "../params.ts";
import { between, round } from "../seed.ts";
import { invalid, ok, type Answer } from "./answer.ts";
import { insightsEnvelope } from "./render.ts";

const AGES = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"];

// Values are signed deviations from the baseline, one block per entity, and the location is ignored.
export function demographics(q: Query): Answer {
  const ids = q.list("signal.interests.entities");
  if (!ids.length && !q.list("signal.interests.tags").length) {
    return invalid("signal.interests.entities or signal.interest.tags is required for demographics insights");
  }
  const rows = ids.map((id) => {
    const male = round(between(`male|${id}`, -0.2, 0.2), 2);
    const age = Object.fromEntries(AGES.map((a) => [a, round(between(`${a}|${id}`, -0.5, 0.3), 2)]));
    return { entity_id: id, query: { age, gender: { female: -male, male } } };
  });
  return ok(insightsEnvelope("demographics", rows));
}
