import { normalizeName } from "../copy/claims.ts";

export function sameName(a: string, b: string): boolean {
  const x = normalizeName(a).replace(/^the /, "");
  const y = normalizeName(b).replace(/^the /, "");
  if (!x || !y) return false;
  if (x === y) return true;
  // A branch suffix is fine ("Sora Ramen Williamsburg"); a fragment from the middle ("St John" inside an author's name) is not.
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if ((short.includes(" ") || short.length >= 6) && long.startsWith(`${short} `)) return true;
  const xs = new Set(x.split(" "));
  const ys = new Set(y.split(" "));
  const inter = [...xs].filter((w) => ys.has(w)).length;
  return inter / new Set([...xs, ...ys]).size >= 0.6;
}
