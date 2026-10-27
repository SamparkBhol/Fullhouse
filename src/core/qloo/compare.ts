import { resultsOf } from "./results.ts";
import { parseTag, type QTag } from "./tags.ts";
import { list, num, obj, str } from "./values.ts";

export interface CompareInput {
  id: string;
  name: string;
}

export interface SharedTag extends QTag {
  a: CompareInput[];
  b: CompareInput[];
}

export interface SideTag extends QTag {
  count: number;
}

export interface CompareRead {
  shared: SharedTag[];
  a: SideTag[];
  b: SideTag[];
}

function inputs(raw: unknown): CompareInput[] {
  return list(raw).flatMap((row) => {
    const id = str(obj(row).entity_id);
    const name = str(obj(row).name);
    return id && name ? [{ id, name }] : [];
  });
}

// Shared tags list which inputs carry them under the literal keys "a.signal.interests.entities" and "b.signal.interests.entities".
function sharedTag(raw: unknown): SharedTag | null {
  const tag = parseTag(raw);
  if (!tag) return null;
  const q = obj(obj(raw).query);
  return { ...tag, a: inputs(q["a.signal.interests.entities"]), b: inputs(q["b.signal.interests.entities"]) };
}

// Each side's own tags carry query.count, the number of that side's inputs with the tag, as a string.
function sideTag(raw: unknown): SideTag | null {
  const tag = parseTag(raw);
  return tag ? { ...tag, count: num(obj(obj(raw).query).count) ?? 1 } : null;
}

function rows<T>(raw: unknown, read: (row: unknown) => T | null): T[] {
  return list(raw).flatMap((row) => {
    const t = read(row);
    return t ? [t] : [];
  });
}

// The answer is {duration, results: {tags, a, b, matchEntities}}, with no success flag.
export function parseCompare(body: unknown): CompareRead {
  const r = obj(resultsOf(body));
  return { shared: rows(r.tags, sharedTag), a: rows(r.a, sideTag), b: rows(r.b, sideTag) };
}
