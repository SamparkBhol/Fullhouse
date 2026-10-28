export const ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
export const VENUE_ID_RE = /^[a-km-np-z2-9]{12}$/;
export const NIGHT_ID_RE = /^[a-km-np-z2-9]{14}$/;

export function randomId(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += ID_ALPHABET[b & 31];
  return out;
}

export const newVenueId = (): string => randomId(12);
export const newNightId = (): string => randomId(14);
