import type { Query } from "../params.ts";
import { between } from "../seed.ts";
import type { FakePlace } from "../world/places.ts";
import type { PlaceRegistry } from "../world/registry.ts";
import type { TagDef } from "../world/tags.ts";
import { invalid, ok, type Answer } from "./answer.ts";
import { compareTagRow } from "./render.ts";

const SIDE_A = "a.signal.interests.entities";
const SIDE_B = "b.signal.interests.entities";

interface Carried {
  tag: TagDef;
  by: FakePlace[];
}

function carried(side: FakePlace[]): Map<string, Carried> {
  const out = new Map<string, Carried>();
  for (const p of side) {
    for (const t of p.tags) {
      const row = out.get(t.id) ?? { tag: t, by: [] };
      row.by.push(p);
      out.set(t.id, row);
    }
  }
  return out;
}

function input(p: FakePlace): Record<string, string> {
  return { disambiguation: p.address, entity_id: p.id, name: p.name, subtype: "urn:entity:place" };
}

function sideRows(side: Map<string, Carried>): unknown[] {
  return [...side.values()]
    .sort((x, y) => y.by.length - x.by.length || x.tag.id.localeCompare(y.tag.id))
    .map((c) => compareTagRow(c.tag, between(`pop|${c.tag.id}`, 0.7, 1), { count: String(c.by.length) }));
}

// Each side lists every tag its inputs carry with a count as a string; tags lists the ones both sides carry.
export function compare(q: Query, places: PlaceRegistry): Answer {
  const a = q.list(SIDE_A);
  const b = q.list(SIDE_B);
  if (!a.length || !b.length) return invalid(`${SIDE_A} and ${SIDE_B} are both required`, a.length ? SIDE_B : SIDE_A);
  const known = (ids: string[]) => ids.map((id) => places.find(id)).filter((p): p is FakePlace => p !== undefined);
  const sideA = carried(known(a));
  const sideB = carried(known(b));
  const shared = [...sideA.values()]
    .filter((c) => sideB.has(c.tag.id))
    .map((c) =>
      compareTagRow(c.tag, between(`pop|${c.tag.id}`, 0.7, 1), {
        score: between(`score|${c.tag.id}`, 0.5, 0.95),
        [SIDE_A]: c.by.map(input),
        [SIDE_B]: (sideB.get(c.tag.id)?.by ?? []).map(input),
      }),
    );
  return ok({ duration: 31, results: { a: sideRows(sideA), b: sideRows(sideB), matchEntities: [], tags: shared } });
}
