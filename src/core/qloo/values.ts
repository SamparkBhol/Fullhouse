export type Obj = Record<string, unknown>;

export function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function obj(v: unknown): Obj {
  return isObj(v) ? v : {};
}

export function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

// Trending sends population_rank and compare sends query.count as strings.
export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

// Some tag names arrive with a leading space, such as " indie".
export function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export function sameId(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase();
}
