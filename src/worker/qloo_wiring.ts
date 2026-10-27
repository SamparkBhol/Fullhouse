import type { Qloo, QlooCache, QlooOptions } from "../core/index.ts";
import type { Env } from "./env.ts";
import type { MeterApi } from "./meter_core.ts";
import { sha256hex } from "./tokens.ts";

export type CreateQloo = (opts: QlooOptions) => Qloo;

export const CACHE_TTL_SEC = 24 * 60 * 60;

// The meter is asked for calls in chunks so a 30 call read costs a handful of meter round trips, not 30.
export function reservingBudget(meter: MeterApi, chunk = 10): (calls: number) => Promise<boolean> {
  let left = 0;
  return async (calls: number) => {
    if (calls <= left) {
      left -= calls;
      return true;
    }
    const need = calls - left;
    if (await meter.spend(Math.max(chunk, need))) {
      left = Math.max(chunk, need) - need;
      return true;
    }
    if (need < chunk && (await meter.spend(need))) {
      left = 0;
      return true;
    }
    return false;
  };
}

interface CacheLike {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

async function openCache(name: string): Promise<CacheLike | null> {
  try {
    const storage = (globalThis as { caches?: CacheStorage }).caches;
    if (!storage) return null;
    return (await storage.open(name)) as unknown as CacheLike;
  } catch {
    return null;
  }
}

async function cacheRequest(key: string): Promise<Request> {
  return new Request(`https://qloo-cache.fullhouse.internal/v1/${await sha256hex(key)}`);
}

// Cache API calls share the 50 subrequest quota of a free plan invocation with fetch, so each
// instance stops touching the cache after `cap` operations and lets the call go to Qloo instead.
export function cacheApiCache(cap: number, open: (name: string) => Promise<CacheLike | null> = openCache): QlooCache {
  let ops = 0;
  let cache: Promise<CacheLike | null> | undefined;
  const take = (): boolean => {
    if (ops >= cap) return false;
    ops += 1;
    return true;
  };
  return {
    async get(key) {
      if (!take()) return undefined;
      cache ??= open("qloo");
      const c = await cache;
      if (!c) return undefined;
      try {
        const hit = await c.match(await cacheRequest(key));
        return hit ? ((await hit.json()) as unknown) : undefined;
      } catch {
        return undefined;
      }
    },
    async put(key, body, ttlSec) {
      if (body === undefined || !take()) return;
      cache ??= open("qloo");
      const c = await cache;
      if (!c) return;
      try {
        const res = new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json", "cache-control": `max-age=${Math.max(60, Math.floor(ttlSec))}` },
        });
        await c.put(await cacheRequest(key), res);
      } catch {
        // A failed cache write only costs a repeat call later.
      }
    },
  };
}

export interface SqlLike {
  exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] };
}

export function sqlCache(sql: SqlLike, now: () => Date = () => new Date()): QlooCache {
  let ready = false;
  const init = (): void => {
    if (ready) return;
    sql.exec("CREATE TABLE IF NOT EXISTS qloo_cache (k TEXT PRIMARY KEY, exp INTEGER NOT NULL, body TEXT NOT NULL)");
    sql.exec("DELETE FROM qloo_cache WHERE exp < ?", now().getTime());
    ready = true;
  };
  return {
    async get(key) {
      try {
        init();
        const row = sql.exec("SELECT body, exp FROM qloo_cache WHERE k = ?", key).toArray()[0];
        if (!row || Number(row["exp"]) < now().getTime()) return undefined;
        return JSON.parse(String(row["body"])) as unknown;
      } catch {
        return undefined;
      }
    },
    async put(key, body, ttlSec) {
      if (body === undefined) return;
      try {
        init();
        sql.exec(
          "INSERT OR REPLACE INTO qloo_cache (k, exp, body) VALUES (?, ?, ?)",
          key,
          now().getTime() + Math.floor(ttlSec) * 1000,
          JSON.stringify(body),
        );
      } catch {
        // Oversized bodies are simply not cached.
      }
    },
  };
}

export function memoryCache(): QlooCache & { size(): number } {
  const map = new Map<string, unknown>();
  return {
    async get(key) {
      return map.has(key) ? structuredClone(map.get(key)) : undefined;
    },
    async put(key, body) {
      map.set(key, structuredClone(body));
    },
    size: () => map.size,
  };
}

export function tieredCache(near: QlooCache, far: QlooCache): QlooCache {
  return {
    async get(key) {
      const a = await near.get(key);
      if (a !== undefined) return a;
      const b = await far.get(key);
      if (b !== undefined) await near.put(key, b, CACHE_TTL_SEC);
      return b;
    },
    async put(key, body, ttlSec) {
      await near.put(key, body, ttlSec);
      await far.put(key, body, ttlSec);
    },
  };
}

export function buildQloo(
  env: Env,
  createQloo: CreateQloo,
  cache: QlooCache,
  meter: MeterApi,
  fetcher?: typeof fetch,
): Qloo | null {
  const apiKey = env.QLOO_API_KEY?.trim();
  if (!apiKey) return null;
  const opts: QlooOptions = {
    apiKey,
    cache,
    budget: reservingBudget(meter),
  };
  const base = env.QLOO_BASE_URL?.trim();
  if (base) opts.baseUrl = base;
  if (fetcher) opts.fetch = fetcher;
  return createQloo(opts);
}

export const QLOO_KEY_MISSING = {
  status: 503,
  error: "qloo_key_missing",
  detail: "The Qloo API key is not set on this server, so no taste data can be fetched. Nothing is shown in its place.",
} as const;

export interface QlooErrorLike {
  status: number;
  kind: string;
  message: string;
}

export function isQlooError(err: unknown): err is QlooErrorLike {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { kind?: unknown }).kind === "string" &&
    typeof (err as { status?: unknown }).status === "number"
  );
}

export function qlooFailure(err: QlooErrorLike): { status: number; error: string; detail: string } {
  switch (err.kind) {
    case "budget":
      return { status: 503, error: "qloo_budget_spent", detail: "Today's Qloo call budget is spent. It resets at midnight UTC." };
    case "auth":
      return { status: 502, error: "qloo_auth", detail: "Qloo refused the API key. The server owner needs to check it." };
    case "rate":
      return { status: 503, error: "qloo_rate_limited", detail: "Qloo asked us to slow down. Try again in a minute." };
    case "timeout":
    case "network":
      return { status: 504, error: "qloo_unreachable", detail: "Qloo did not answer in time. Try again shortly." };
    case "not_found":
      return { status: 404, error: "qloo_not_found", detail: "Qloo has no record for what was asked." };
    case "bad_request":
      return { status: 502, error: "qloo_bad_request", detail: "Qloo rejected a request we built. This is our bug, and it was logged." };
    default:
      return { status: 502, error: "qloo_error", detail: "Qloo returned an error. Try again shortly." };
  }
}
