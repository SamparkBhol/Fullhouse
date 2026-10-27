export interface FieldShape {
  types: string[];
  seen: number;
  presence: number;
  nullable?: true;
  length?: [number, number];
  range?: [number, number];
  example?: string | number | boolean;
}

export interface ShapeSummary {
  responses: number;
  fields: Record<string, FieldShape>;
}

interface Tally {
  types: Set<string>;
  seen: number;
  nulls: number;
  minLen: number;
  maxLen: number;
  min: number;
  max: number;
  example?: string | number | boolean;
}

const MAX_DEPTH = 12;
const UNEXPANDED = new Set(["akas", "short_descriptions"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function kindOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

// Keys that are ids would give every response its own paths, so they fold into one placeholder.
function keyLabel(key: string): string {
  if (UUID.test(key)) return "{entity_id}";
  if (key.startsWith("urn:")) return "{urn}";
  return key;
}

function join(path: string, key: string): string {
  return path ? `${path}.${keyLabel(key)}` : keyLabel(key);
}

function parentOf(path: string): string | null {
  if (path.endsWith("[]")) return null;
  const cut = path.lastIndexOf(".");
  return cut < 0 ? "" : path.slice(0, cut);
}

function createShape() {
  const tallies = new Map<string, Tally>();
  let responses = 0;

  function tally(path: string): Tally {
    let t = tallies.get(path);
    if (!t) {
      t = { types: new Set(), seen: 0, nulls: 0, minLen: Infinity, maxLen: -Infinity, min: Infinity, max: -Infinity };
      tallies.set(path, t);
    }
    return t;
  }

  function visit(value: unknown, path: string, depth: number): void {
    const t = tally(path);
    const kind = kindOf(value);
    t.seen += 1;
    t.types.add(kind);
    if (value === null) t.nulls += 1;
    if (typeof value === "number") {
      t.min = Math.min(t.min, value);
      t.max = Math.max(t.max, value);
    }
    if ((typeof value === "string" || typeof value === "boolean" || typeof value === "number") && t.example === undefined) {
      t.example = typeof value === "string" ? value.slice(0, 80) : value;
    }
    if (depth >= MAX_DEPTH) return;
    if (Array.isArray(value)) {
      t.minLen = Math.min(t.minLen, value.length);
      t.maxLen = Math.max(t.maxLen, value.length);
      const last = path.split(".").pop() ?? "";
      if (!UNEXPANDED.has(last)) for (const item of value) visit(item, `${path}[]`, depth + 1);
    } else if (kind === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) visit(v, join(path, k), depth + 1);
    }
  }

  function add(body: unknown): void {
    responses += 1;
    visit(body, "", 0);
  }

  function summary(): ShapeSummary {
    const fields: Record<string, FieldShape> = {};
    for (const [path, t] of [...tallies.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (path === "") continue;
      const parent = parentOf(path);
      const base = parent === null ? t.seen : parent === "" ? responses : tallies.get(parent)?.seen ?? t.seen;
      const f: FieldShape = { types: [...t.types].sort(), seen: t.seen, presence: Math.round((t.seen / Math.max(1, base)) * 100) / 100 };
      if (t.nulls) f.nullable = true;
      if (t.maxLen >= 0) f.length = [t.minLen, t.maxLen];
      if (t.max >= t.min) f.range = [t.min, t.max];
      if (t.example !== undefined) f.example = t.example;
      fields[path] = f;
    }
    return { responses, fields };
  }

  return { add, summary };
}

export function shapeKey(rec: { group: string; call: string }): string {
  return rec.group === "city" ? "city_search" : rec.call;
}

export function shapesOf(records: Array<{ group: string; call: string; status: number; body: unknown }>): Record<string, ShapeSummary> {
  const byKey = new Map<string, ReturnType<typeof createShape>>();
  for (const rec of records) {
    if (rec.body === null || rec.body === undefined) continue;
    const key = rec.status === 200 ? shapeKey(rec) : `${shapeKey(rec)} (HTTP ${rec.status})`;
    const shape = byKey.get(key) ?? createShape();
    shape.add(rec.body);
    byKey.set(key, shape);
  }
  const out: Record<string, ShapeSummary> = {};
  for (const key of [...byKey.keys()].sort()) out[key] = byKey.get(key)!.summary();
  return out;
}
