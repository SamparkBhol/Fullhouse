import { hmacSha256 } from "./crypto.ts";

const enc = new TextEncoder();

export function timingSafeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// The nonce lives in the venue's Durable Object, so a new owner link cuts off every old one for that venue only.
// Venues made before the nonce existed have none and keep their first link until the owner asks for a new one.
export function ownerToken(secret: string, venueId: string, nonce = ""): Promise<string> {
  return hmacSha256(secret, nonce ? `owner:${venueId}:${nonce}` : `owner:${venueId}`);
}

export async function verifyOwnerToken(secret: string, venueId: string, nonce: string, token: string | null | undefined): Promise<boolean> {
  if (!secret || !token || token.length > 128) return false;
  return timingSafeEqual(await ownerToken(secret, venueId, nonce), token);
}

export function ownerUrl(origin: string, venueId: string, token: string): string {
  return `${origin}/v/${venueId}#t=${token}`;
}
