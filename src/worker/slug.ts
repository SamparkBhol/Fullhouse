import { randomId, VENUE_ID_RE } from "./tokens.ts";

const SLUG_RE = /^[a-z0-9-]{1,120}$/;

export function titleWords(title: string): string {
  const words = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 6);
  let out = "";
  for (const w of words) {
    const next = out ? `${out}-${w}` : w;
    if (next.length > 48) break;
    out = next;
  }
  return out || "night";
}

// The venue id rides inside the slug so a public page finds its Durable Object without a lookup table.
export function makeSlug(title: string, venueId: string, rand: string = randomId(5)): string {
  return `${titleWords(title)}-${venueId}-${rand}`;
}

export function venueIdFromSlug(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return null;
  const parts = slug.split("-");
  if (parts.length < 3) return null;
  const rand = parts[parts.length - 1] ?? "";
  const venueId = parts[parts.length - 2] ?? "";
  if (!/^[a-km-np-z2-9]{5}$/.test(rand) || !VENUE_ID_RE.test(venueId)) return null;
  return venueId;
}
