const enc = new TextEncoder();

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

export function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of u8) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function timingSafeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function ownerToken(secret: string, venueId: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`owner:${venueId}`));
  return base64url(sig);
}

export async function verifyOwnerToken(secret: string, venueId: string, token: string | null | undefined): Promise<boolean> {
  if (!token || token.length > 128) return false;
  return timingSafeEqual(await ownerToken(secret, venueId), token);
}

export function ownerUrl(origin: string, venueId: string, token: string): string {
  return `${origin}/v/${venueId}#t=${token}`;
}

export async function sha256hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  let bin = "";
  for (const b of new Uint8Array(digest)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export interface Sealed {
  iv: string;
  ct: string;
}

async function sealKey(secret: string, context: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("fullhouse/eventbrite/v1"), info: enc.encode(context) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function seal(secret: string, context: string, plain: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await sealKey(secret, context), enc.encode(plain));
  return { iv: base64url(iv), ct: base64url(ct) };
}

export async function unseal(secret: string, context: string, sealed: Sealed): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64url(sealed.iv) },
    await sealKey(secret, context),
    fromBase64url(sealed.ct),
  );
  return new TextDecoder().decode(plain);
}
