import { parseWktPoint, type Point } from "./geo.ts";

export interface Query {
  one(key: string): string | undefined;
  list(key: string): string[];
  entries(): Record<string, string>;
}

// The live API refuses a repeated key with HTTP 400, so the fake reports the first one it finds.
export function parseQuery(search: URLSearchParams): { query: Query } | { repeated: string } {
  const values = new Map<string, string>();
  for (const [key, value] of search) {
    if (values.has(key)) return { repeated: key };
    values.set(key, value);
  }
  const one = (key: string) => {
    const v = values.get(key)?.trim();
    return v ? v : undefined;
  };
  return {
    query: {
      one,
      list: (key) => (one(key) ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      entries: () => Object.fromEntries(values),
    },
  };
}

export function takeOf(q: Query, fallback: number): number | null {
  const raw = q.one("take");
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null;
}

export function wkt(q: Query, key: string): Point | null {
  const raw = q.one(key);
  return raw ? parseWktPoint(raw) : null;
}
