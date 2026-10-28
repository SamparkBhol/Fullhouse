import type { Query } from "../params.ts";
import { WORK_URN, worksOf, type WorkType } from "../world/media.ts";
import type { PlaceRegistry } from "../world/registry.ts";
import { invalid, ok, type Answer } from "./answer.ts";
import { searchPlace } from "./render.ts";

// /entities?entity_ids= answers {results: [...]} with the entities it knows and quietly skips the rest.
export function entities(q: Query, places: PlaceRegistry): Answer {
  const ids = q.list("entity_ids").map((id) => id.toUpperCase());
  if (!ids.length) return invalid("entity_ids is required", "entity_ids");
  const works = (Object.keys(WORK_URN) as WorkType[]).flatMap(worksOf);
  const results = ids.flatMap((id) => {
    const place = places.find(id);
    if (place) return [searchPlace(place)];
    const work = works.find((w) => w.id.toUpperCase() === id);
    return work ? [{ entity_id: work.id, name: work.name, types: [WORK_URN[work.type]], disambiguation: work.disambiguation }] : [];
  });
  return ok({ results });
}
