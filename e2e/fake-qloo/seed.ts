// FNV-1a, so the same request always gets the same answer and different requests get different ones.
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function unit(text: string): number {
  return hash(text) / 0x100000000;
}

export function between(text: string, min: number, max: number): number {
  return min + unit(text) * (max - min);
}

export function round(n: number, digits = 5): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function uuidFrom(text: string): string {
  const hex = [0, 1, 2, 3].map((i) => hash(`${i}|${text}`).toString(16).padStart(8, "0")).join("").toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-A${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function shuffled<T>(items: T[], seed: string): T[] {
  return items
    .map((item, i) => ({ item, k: hash(`${seed}|${i}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.item);
}
