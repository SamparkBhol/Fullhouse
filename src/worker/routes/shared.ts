import type { Context } from "hono";
import type { Qloo } from "../../core/index.ts";
import type { BurstLimiter } from "../burst.ts";
import type { VenueCandidate } from "../../shared/contract.ts";
import { tokenSecretOf, type Env } from "../env.ts";
import { API_HEADERS, apiError, ipKey, pageCsp, pageHeaders } from "../http.ts";
import type { LimitKind, MeterApi } from "../meter_core.ts";
import { pageHashes } from "../pages/style.ts";
import { buildQloo, type CreateQloo } from "../qloo/build.ts";
import { cacheApiCache } from "../qloo/caches.ts";
import { isQlooError, qlooFailure, QLOO_KEY_MISSING } from "../qloo/errors.ts";
import type { StatsApi } from "../stats/buffer.ts";
import type { StatsSink } from "../stats/events.ts";
import type { Out, VenueApi } from "../venue/api.ts";

export interface AppDeps {
  createQloo: CreateQloo;
  findVenues(q: Qloo, name: string, city: string): Promise<VenueCandidate[]>;
  venue(env: Env, id: string): VenueApi;
  meter(env: Env): MeterApi;
  stats?(env: Env): StatsApi;
  font?: ArrayBuffer;
}

export type AppEnv = { Bindings: Env; Variables: { venue: VenueApi; venueId: string; stats: StatsSink } };
export type Ctx = Context<AppEnv>;

export class HttpError extends Error {
  retryAfter?: number;

  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail?: string,
  ) {
    super(code);
  }
}

export function json(value: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...API_HEADERS, ...extra },
  });
}

export function send<T>(out: Out<T>, status = 200): Response {
  return out.ok ? json(out.value, status) : apiError(out.status, out.error, out.detail);
}

export function asOut<T>(err: HttpError): Out<T> {
  return { ok: false, status: err.status, error: err.code, ...(err.detail ? { detail: err.detail } : {}) };
}

// Hono's bodyLimit only answers 413 when its own error reaches the app error handler.
export function isBodyLimit(err: unknown): boolean {
  return err instanceof Error && err.name === "BodyLimitError";
}

export async function readBody(c: Ctx): Promise<unknown> {
  const type = c.req.header("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) throw new HttpError(415, "unsupported_media_type", "Send JSON with content-type application/json.");
  let text: string;
  try {
    text = await c.req.text();
  } catch (err) {
    if (isBodyLimit(err)) throw err;
    throw new HttpError(400, "invalid_body", "The body could not be read.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "invalid_json", "The body is not valid JSON.");
  }
}

export function secretOf(env: Env): string {
  const s = tokenSecretOf(env);
  if (!s) throw new HttpError(503, "token_secret_missing", "TOKEN_SECRET is not set on this server, so owner links cannot be issued or checked.");
  return s;
}

// A scope, such as one night's slug, gives the same caller a separate count per thing.
export async function limit(c: Ctx, deps: AppDeps, kind: LimitKind, scope = ""): Promise<void> {
  const ip = await ipKey(c.req.raw, tokenSecretOf(c.env) || "fullhouse");
  const key = scope ? `${ip}:${scope}` : ip;
  const r = await deps.meter(c.env).hit(key, kind);
  if (!r.ok) {
    const err = new HttpError(429, "rate_limited", `Daily limit for this kind of request reached. Try again in ${Math.ceil(r.retryAfterS / 3600)} hours.`);
    err.retryAfter = r.retryAfterS;
    throw err;
  }
}

// A per address limit kept in the isolate, for routes that must turn a tight loop away before any Durable Object call.
export async function refuseBurst(c: Ctx, limiter: BurstLimiter): Promise<Response | null> {
  const r = limiter.take(await ipKey(c.req.raw, tokenSecretOf(c.env) || "fullhouse"), Date.now());
  if (r.ok) return null;
  const res = apiError(429, "rate_limited", `Too many requests from this address. Try again in ${r.retryAfterS} seconds.`);
  res.headers.set("retry-after", String(r.retryAfterS));
  return res;
}

function workerQloo(c: Ctx, deps: AppDeps): Qloo {
  const q = buildQloo(c.env, deps.createQloo, cacheApiCache(4), deps.meter(c.env), false, c.var.stats);
  if (!q) throw new HttpError(QLOO_KEY_MISSING.status, QLOO_KEY_MISSING.error, QLOO_KEY_MISSING.detail);
  return q;
}

export async function searchVenues(c: Ctx, deps: AppDeps, name: string, city: string): Promise<Out<VenueCandidate[]>> {
  try {
    return { ok: true, value: await deps.findVenues(workerQloo(c, deps), name, city) };
  } catch (err) {
    if (err instanceof HttpError) return asOut(err);
    if (isQlooError(err)) {
      const f = qlooFailure(err);
      console.error("venue search failed", err.kind, err.status);
      return { ok: false, status: f.status, error: f.error, detail: f.detail };
    }
    throw err;
  }
}

export async function pageResponse(html: string, status = 200, script = false): Promise<Response> {
  const h = await pageHashes();
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...pageHeaders(pageCsp(h.style, script ? h.script : undefined)) },
  });
}
