import type { Provenance } from "../../shared/contract.ts";
import {
  QLOO_BASE_URL,
  buildUrl,
  checkParams,
  provenanceParams,
  type ArrayStyle,
  type Params,
} from "./request.ts";
import { countResults } from "./parse.ts";

export type QlooErrorKind =
  | "auth"
  | "rate"
  | "bad_request"
  | "not_found"
  | "server"
  | "budget"
  | "network"
  | "timeout";

export class QlooError extends Error {
  status: number;
  kind: QlooErrorKind;
  call?: string;

  constructor(kind: QlooErrorKind, status: number, message: string, call?: string) {
    super(message);
    this.name = "QlooError";
    this.kind = kind;
    this.status = status;
    if (call !== undefined) this.call = call;
  }
}

export interface QlooCache {
  get(key: string): Promise<unknown | undefined>;
  put(key: string, body: unknown, ttlSec: number): Promise<void>;
}

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
  arrays?: ArrayStyle;
  cacheTtlSec?: number;
}

export interface QlooResult {
  body: any;
  prov: Provenance;
}

export interface Qloo {
  get(call: string, path: string, params: Record<string, string | string[]>): Promise<QlooResult>;
  post?(call: string, path: string, params: Record<string, string>, body: unknown): Promise<QlooResult>;
  now?: () => Date;
}

export const DEFAULT_TIMEOUT_MS = 8000;
export const DEFAULT_RETRIES = 2;
export const CACHE_TTL_SEC = 86400;
const MAX_BACKOFF_MS = 4000;

interface CacheEnvelope {
  fullhouseCache: 1;
  at: string;
  body: unknown;
}

function isEnvelope(v: unknown): v is CacheEnvelope {
  return typeof v === "object" && v !== null && (v as CacheEnvelope).fullhouseCache === 1 && "body" in v;
}

export function errorMessage(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const b = body as Record<string, any>;
  const inner = typeof b.error === "object" && b.error !== null ? b.error : b;
  const parts = [inner.message, inner.reason].filter((v) => typeof v === "string" && v.trim() !== "");
  if (typeof b.error === "string") parts.push(b.error);
  return parts.join(": ").slice(0, 300);
}

export function classify(status: number, message: string): QlooErrorKind {
  if (status === 401) return "auth";
  if (status === 403) return /permission to access urn:/i.test(message) ? "bad_request" : "auth";
  if (status === 404) return "not_found";
  if (status === 429) return "rate";
  if (status >= 500) return "server";
  return "bad_request";
}

function retryable(kind: QlooErrorKind): boolean {
  return kind === "rate" || kind === "server";
}

function retryAfterMs(headers: Headers): number | null {
  const v = headers.get("retry-after");
  if (!v) return null;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(v);
  return Number.isFinite(when) ? Math.max(0, when - Date.now()) : null;
}

export function backoffMs(attempt: number): number {
  return Math.min(MAX_BACKOFF_MS, 400 * 2 ** attempt);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createQloo(opts: QlooOptions): Qloo {
  if (!opts.apiKey || typeof opts.apiKey !== "string") {
    throw new QlooError("auth", 0, "QLOO_API_KEY is not set");
  }
  const baseUrl = opts.baseUrl ?? QLOO_BASE_URL;
  if (!/^https:\/\//.test(baseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(baseUrl)) {
    throw new QlooError("bad_request", 0, "Qloo base URL must be https, or http on loopback for tests");
  }
  const doFetch = opts.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const now = opts.now ?? (() => new Date());
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = Math.max(0, Math.min(5, opts.retries ?? DEFAULT_RETRIES));
  const sleep = opts.sleep ?? defaultSleep;
  const ttl = opts.cacheTtlSec ?? CACHE_TTL_SEC;
  const arrays = opts.arrays ?? "comma";

  async function send(call: string, method: "GET" | "POST", url: string, body?: unknown): Promise<{ json: unknown; ms: number }> {
    let attempt = 0;
    for (;;) {
      if (opts.budget && !(await opts.budget(1))) {
        throw new QlooError("budget", 0, "The daily Qloo call budget is spent", call);
      }
      const started = Date.now();
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      let res: Response;
      try {
        const headers: Record<string, string> = { "X-Api-Key": opts.apiKey, Accept: "application/json" };
        const init: RequestInit = { method, headers, signal: controller.signal };
        if (method === "POST") {
          headers["Content-Type"] = "application/json";
          init.body = JSON.stringify(body ?? {});
        }
        res = await doFetch(url, init);
      } catch (err) {
        clearTimeout(timer);
        if (timedOut) throw new QlooError("timeout", 0, `Qloo did not answer within ${timeoutMs} ms`, call);
        throw new QlooError("network", 0, `Could not reach Qloo: ${(err as Error)?.name ?? "error"}`, call);
      }
      let text = "";
      try {
        text = await res.text();
      } catch {
        clearTimeout(timer);
        if (timedOut) throw new QlooError("timeout", res.status, `Qloo did not finish within ${timeoutMs} ms`, call);
        throw new QlooError("network", res.status, "Qloo response was cut off", call);
      }
      clearTimeout(timer);
      const ms = Date.now() - started;
      let json: unknown = undefined;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = undefined;
      }
      if (res.ok) {
        if (json === undefined) throw new QlooError("server", res.status, "Qloo returned a body that is not JSON", call);
        return { json, ms };
      }
      const message = errorMessage(json) || `HTTP ${res.status}`;
      const kind = classify(res.status, message);
      if (retryable(kind) && attempt < retries) {
        const wait = retryAfterMs(res.headers);
        await sleep(wait === null ? backoffMs(attempt) : Math.min(wait, MAX_BACKOFF_MS));
        attempt++;
        continue;
      }
      throw new QlooError(kind, res.status, `Qloo ${res.status}: ${message}`, call);
    }
  }

  async function get(call: string, path: string, params: Params): Promise<QlooResult> {
    const problem = checkParams(params);
    if (problem) throw new QlooError("bad_request", 0, problem, call);
    const url = buildUrl(baseUrl, path, params, arrays);
    const shown = provenanceParams(params);
    if (opts.cache) {
      let hit: unknown;
      try {
        hit = await opts.cache.get(url);
      } catch {
        hit = undefined;
      }
      if (hit !== undefined && hit !== null) {
        const env = isEnvelope(hit) ? hit : { fullhouseCache: 1 as const, at: now().toISOString(), body: hit };
        return {
          body: env.body,
          prov: { call, endpoint: path, params: shown, at: env.at, resultCount: countResults(env.body), cached: true, ms: 0 },
        };
      }
    }
    const at = now().toISOString();
    const { json, ms } = await send(call, "GET", url);
    if (opts.cache) {
      const env: CacheEnvelope = { fullhouseCache: 1, at, body: json };
      try {
        await opts.cache.put(url, env, ttl);
      } catch {
        // A cache write failure only costs a repeat call later.
      }
    }
    return { body: json, prov: { call, endpoint: path, params: shown, at, resultCount: countResults(json), cached: false, ms } };
  }

  async function post(call: string, path: string, params: Record<string, string>, body: unknown): Promise<QlooResult> {
    const problem = checkParams(params);
    if (problem) throw new QlooError("bad_request", 0, problem, call);
    const url = buildUrl(baseUrl, path, params, arrays);
    const at = now().toISOString();
    const { json, ms } = await send(call, "POST", url, body);
    const shown = provenanceParams(params);
    if (typeof body === "object" && body !== null) {
      for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
        if (!/key|token|secret|password/i.test(k)) shown[`body.${k}`] = typeof v === "string" ? v : JSON.stringify(v);
      }
    }
    return { body: json, prov: { call, endpoint: path, params: shown, at, resultCount: countResults(json), cached: false, ms } };
  }

  return { get, post, now };
}
