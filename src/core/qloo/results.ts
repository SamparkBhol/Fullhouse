import { isObj, list, obj, str } from "./values.ts";

export function resultsOf(body: unknown): unknown {
  return isObj(body) ? body.results : undefined;
}

// /search and /entities answer {results: [...]}; insights, compare and trending nest arrays under results.
export function resultRows(body: unknown, key: string): unknown[] {
  const r = resultsOf(body);
  return Array.isArray(r) ? r : list(obj(r)[key]);
}

function compareTagCount(r: Record<string, unknown>): number {
  const ids = new Set<string>();
  for (const key of ["tags", "a", "b"]) {
    for (const row of list(r[key])) {
      const id = str(obj(row).tag_id);
      if (id) ids.add(id);
    }
  }
  return ids.size;
}

export function countResults(body: unknown): number {
  const r = resultsOf(body);
  if (Array.isArray(r)) return r.length;
  if (!isObj(r)) return 0;
  if (Array.isArray(r.a) && Array.isArray(r.b)) return compareTagCount(r);
  for (const key of ["entities", "tags", "heatmap", "demographics", "trending"]) {
    if (Array.isArray(r[key])) return r[key].length;
  }
  return 0;
}
