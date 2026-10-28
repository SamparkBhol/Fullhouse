import { sha256hex } from "../crypto.ts";

export async function etagOf(body: string): Promise<string> {
  return `"${(await sha256hex(body)).slice(0, 24)}"`;
}

export function matchesEtag(header: string | null | undefined, etag: string): boolean {
  if (!header) return false;
  return header
    .split(",")
    .map((t) => t.trim().replace(/^W\//, ""))
    .some((t) => t === "*" || t === etag);
}

// Polling sends If-None-Match, so an unchanged answer costs a 304 with no body.
export function conditional(ifNoneMatch: string | undefined, body: string, etag: string, headers: Record<string, string>): Response {
  if (matchesEtag(ifNoneMatch, etag)) return new Response(null, { status: 304, headers: { etag, ...headers } });
  return new Response(body, { status: 200, headers: { etag, ...headers } });
}
