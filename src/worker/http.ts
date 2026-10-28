import type { ApiError } from "../shared/contract.ts";
import type { Env } from "./env.ts";
import { sha256hex } from "./crypto.ts";

export const BODY_LIMIT = 64 * 1024;

export const OSM_IMG_HOSTS = "https://tile.openstreetmap.org https://*.tile.openstreetmap.org";

export const API_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "cross-origin-resource-policy": "same-origin",
};

export function pageCsp(styleHash: string, scriptHash?: string): string {
  return [
    "default-src 'self'",
    `img-src 'self' data: ${OSM_IMG_HOSTS}`,
    `style-src 'self' '${styleHash}'`,
    scriptHash ? `script-src '${scriptHash}'` : "script-src 'none'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function pageHeaders(csp: string): Record<string, string> {
  return {
    "x-content-type-options": "nosniff",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    "content-security-policy": csp,
    "x-robots-tag": "noindex, nofollow",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
}

export function apiError(status: number, error: string, detail?: string): Response {
  const body: ApiError = detail ? { error, detail } : { error };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...API_HEADERS },
  });
}

export function allowedOrigins(env: Env, ownOrigin: string): Set<string> {
  const set = new Set([ownOrigin]);
  for (const o of (env.EXTRA_ORIGINS ?? "").split(",")) {
    const t = o.trim();
    if (t) set.add(t);
  }
  return set;
}

export function originAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return allowedOrigins(env, new URL(request.url).origin).has(origin);
}

export function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins(env, new URL(request.url).origin).has(origin)) return { vary: "Origin" };
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "false",
    "access-control-expose-headers": "content-type, retry-after, mcp-protocol-version",
    vary: "Origin",
  };
}

export function preflight(request: Request, env: Env): Response {
  if (!originAllowed(request, env)) return apiError(403, "origin_not_allowed", "This API only answers its own site.");
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request, env),
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      "access-control-allow-headers": "authorization, content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id",
      "access-control-max-age": "600",
    },
  });
}

export function bearer(request: Request): string | null {
  const h = request.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(h.trim());
  return m ? (m[1] ?? null) : null;
}

// One IPv6 customer usually holds a whole /64, so limits count the /64 and not the single address.
export function clientIp(request: Request): string {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? "unknown";
  if (!ip.includes(":")) return ip;
  const groups = expandIpv6(ip);
  return groups ? `${groups.slice(0, 4).join(":")}::/64` : ip;
}

function expandIpv6(ip: string): string[] | null {
  const [head = "", tail = ""] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = ip.includes("::") && tail ? tail.split(":") : [];
  const fill = ip.includes("::") ? 8 - left.length - right.length : 0;
  const groups = [...left, ...Array<string>(Math.max(0, fill)).fill("0"), ...right].map((g) => g.toLowerCase().replace(/^0+(?=.)/, ""));
  return groups.length === 8 ? groups : null;
}

// Meter keys hold a salted hash so raw addresses never sit in storage.
export async function ipKey(request: Request, secret: string): Promise<string> {
  return (await sha256hex(`${secret}|ip|${clientIp(request)}`)).slice(0, 24);
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function setCookie(name: string, value: string, maxAgeSec: number, path: string, secure: boolean): string {
  return `${name}=${value}; Max-Age=${maxAgeSec}; Path=${path}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function withHeaders(response: Response, headers: Record<string, string>): Response {
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(headers)) {
    if (k === "vary" && out.headers.has("vary")) out.headers.append("vary", v);
    else out.headers.set(k, v);
  }
  return out;
}
