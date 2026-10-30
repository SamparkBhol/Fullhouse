import type { Provenance } from "../../shared/contract.ts";
import { CACHE_TTL_SEC } from "../../shared/engine.ts";
import { cacheEntry, isCacheEntry, type QlooCache } from "./cache.ts";
import { QlooError, classify, errorMessage } from "./errors.ts";
import { checkParams } from "./guards.ts";
import { QLOO_BASE_URL, buildUrl, provenanceParams, type Params } from "./request.ts";
import { countResults } from "./results.ts";

export interface QlooOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  cache?: QlooCache;
  budget?: (calls: number) => Promise<boolean>;
  now?: () => Date;
  timeoutMs?: number;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  cacheTtlSec?: number;
}

export interface QlooResult {
  body: unknown;
  prov: Provenance;
}

export interface Qloo {
  get(call: string, path: string, params: Params): Promise<QlooResult>;
  now?: () => Date;
}

export const DEFAULT_TIMEOUT_MS = 8000;
export const DEFAULT_RETRIES = 2;
const BACKOFF_START_MS = 750;
const MAX_BACKOFF_MS = 4000;

// The hackathon host starts answering 429 at about three concurrent requests; one retry after 750 ms cleared every one.
export function backoffMs(attempt: number): number {
  return Math.min(MAX_BACKOFF_MS, BACKOFF_START_MS * 2 ** attempt);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function checkBaseUrl(baseUrl: string): void {
  if (/^https:\/\//.test(baseUrl) || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(baseUrl)) return;
  throw new QlooError("bad_request", 0, "Qloo base URL must be https, or http on loopback for tests");
}

interface Answer {
  status: number;
  ok: boolean;
  json: unknown;
  ms: number;
}

async function fetchOnce(doFetch: typeof fetch, url: string, apiKey: string, timeoutMs: number, call: string): Promise<Answer> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await doFetch(url, { method: "GET", headers: { "X-Api-Key": apiKey, Accept: "application/json" }, signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted) throw new QlooError("timeout", 0, `Qloo did not answer within ${timeoutMs} ms`, call);
      throw new QlooError("network", 0, `Could not reach Qloo: ${(err as Error)?.name ?? "error"}`, call);
    }
    let text: string;
    try {
      text = await res.text();
    } catch {
      if (controller.signal.aborted) throw new QlooError("timeout", res.status, `Qloo did not finish within ${timeoutMs} ms`, call);
      throw new QlooError("network", res.status, "Qloo response was cut off", call);
    }
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = undefined;
    }
    return { status: res.status, ok: res.ok, json, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

export function createQloo(opts: QlooOptions): Qloo {
  if (!opts.apiKey || typeof opts.apiKey !== "string") throw new QlooError("auth", 0, "QLOO_API_KEY is not set");
  const baseUrl = opts.baseUrl ?? QLOO_BASE_URL;
  checkBaseUrl(baseUrl);
  const doFetch = opts.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const now = opts.now ?? (() => new Date());
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = Math.max(0, Math.min(5, opts.retries ?? DEFAULT_RETRIES));
  const sleep = opts.sleep ?? defaultSleep;
  const ttl = opts.cacheTtlSec ?? CACHE_TTL_SEC;

  async function send(call: string, url: string): Promise<{ json: unknown; ms: number }> {
    for (let attempt = 0; ; attempt++) {
      if (opts.budget && !(await opts.budget(1))) throw new QlooError("budget", 0, "The daily Qloo call budget is spent", call);
      const a = await fetchOnce(doFetch, url, opts.apiKey, timeoutMs, call);
      if (a.ok) {
        if (a.json === undefined) throw new QlooError("server", a.status, "Qloo returned a body that is not JSON", call);
        return { json: a.json, ms: a.ms };
      }
      const kind = classify(a.status);
      if ((kind === "rate" || kind === "server") && attempt < retries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new QlooError(kind, a.status, `Qloo ${a.status}: ${errorMessage(a.json) || `HTTP ${a.status}`}`, call);
    }
  }

  async function cached(url: string): Promise<{ at: string; body: unknown } | null> {
    if (!opts.cache) return null;
    try {
      const hit = await opts.cache.get(url);
      return isCacheEntry(hit) ? hit : null;
    } catch {
      return null;
    }
  }

  async function remember(url: string, at: string, body: unknown): Promise<void> {
    try {
      await opts.cache?.put(url, cacheEntry(at, body), ttl);
    } catch {
      // A failed cache write only costs a repeat call later.
    }
  }

  async function get(call: string, path: string, params: Params): Promise<QlooResult> {
    const problem = checkParams(path, params);
    if (problem) throw new QlooError("bad_request", 0, problem, call);
    const url = buildUrl(baseUrl, path, params);
    const shown = provenanceParams(params);
    const hit = await cached(url);
    if (hit) {
      return { body: hit.body, prov: { call, endpoint: path, params: shown, at: hit.at, resultCount: countResults(hit.body), cached: true, ms: 0 } };
    }
    const at = now().toISOString();
    const { json, ms } = await send(call, url);
    await remember(url, at, json);
    return { body: json, prov: { call, endpoint: path, params: shown, at, resultCount: countResults(json), cached: false, ms } };
  }

  return { get, now };
}
