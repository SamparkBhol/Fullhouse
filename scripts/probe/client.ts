import { QLOO_BASE_URL, buildUrl, cleanParams, type Params } from "../../src/core/qloo/index.ts";
import { limiter } from "../../src/core/street/limit.ts";
import type { DiskCache } from "./cache.ts";
import type { Ledger } from "./ledger.ts";
import type { ArrayStyle } from "./record.ts";

export type Failure = "timeout" | "network" | "cap" | "offline" | "not_json";

export interface ProbeAnswer {
  url: string;
  status: number;
  ms: number;
  at: string;
  cached: boolean;
  attempts: number;
  retried: number[];
  body: unknown;
  failure?: Failure;
}

export interface ProbeClient {
  get(path: string, params: Params, arrays?: ArrayStyle): Promise<ProbeAnswer>;
}

export interface ClientOptions {
  apiKey: string;
  cache: DiskCache;
  ledger: Ledger;
  concurrency: number;
  timeoutMs: number;
  retries: number;
  offline?: boolean;
  baseUrl?: string;
}

interface Attempt {
  status: number;
  body: unknown;
  ms: number;
  retryAfter: string | null;
  failure?: Failure;
}

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

function retryable(status: number): boolean {
  return status === 429 || status >= 500;
}

// The app always joins arrays with commas; the repeated key form is kept only to rerun that experiment.
function probeUrl(baseUrl: string, path: string, params: Params, arrays: ArrayStyle): string {
  if (arrays === "comma") return buildUrl(baseUrl, path, params);
  const sp = new URLSearchParams();
  for (const [key, values] of cleanParams(params)) for (const v of values) sp.append(key, v);
  return `${baseUrl.replace(/\/+$/, "")}${path}?${sp}`;
}

function backoffMs(attempt: number, retryAfter: string | null): number {
  const secs = Number(retryAfter);
  if (retryAfter && Number.isFinite(secs)) return Math.min(10000, secs * 1000);
  return Math.min(8000, 750 * 2 ** attempt);
}

async function fetchOnce(url: string, apiKey: string, timeoutMs: number): Promise<Attempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const res = await fetch(url, { headers: { "X-Api-Key": apiKey, Accept: "application/json" }, signal: controller.signal });
    const text = await res.text();
    const ms = Math.round(performance.now() - started);
    const retryAfter = res.headers.get("retry-after");
    try {
      return { status: res.status, body: text ? JSON.parse(text) : {}, ms, retryAfter };
    } catch {
      return { status: res.status, body: text.slice(0, 400), ms, retryAfter, failure: "not_json" };
    }
  } catch {
    const ms = Math.round(performance.now() - started);
    return { status: 0, body: null, ms, retryAfter: null, failure: controller.signal.aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

export function createProbeClient(opts: ClientOptions): ProbeClient {
  const baseUrl = opts.baseUrl ?? QLOO_BASE_URL;
  const throttle = limiter(opts.concurrency);
  const inFlight = new Map<string, Promise<ProbeAnswer>>();

  async function live(url: string): Promise<ProbeAnswer> {
    const at = new Date().toISOString();
    let attempts = 0;
    const retried: number[] = [];
    for (;;) {
      if (!opts.ledger.reserve()) {
        return { url, status: 0, ms: 0, at, cached: false, attempts, retried, body: null, failure: "cap" };
      }
      attempts += 1;
      const a = await fetchOnce(url, opts.apiKey, opts.timeoutMs);
      if (retryable(a.status) && attempts <= opts.retries) {
        retried.push(a.status);
        await pause(backoffMs(attempts - 1, a.retryAfter));
        continue;
      }
      const answer: ProbeAnswer = { url, status: a.status, ms: a.ms, at, cached: false, attempts, retried, body: a.body };
      if (a.failure) answer.failure = a.failure;
      else await opts.cache.write({ url, status: a.status, ms: a.ms, at, retried, body: a.body });
      return answer;
    }
  }

  async function get(path: string, params: Params, arrays: ArrayStyle = "comma"): Promise<ProbeAnswer> {
    const url = probeUrl(baseUrl, path, params, arrays);
    const hit = await opts.cache.read(url);
    if (hit) return { url, status: hit.status, ms: hit.ms, at: hit.at, cached: true, attempts: 0, retried: hit.retried ?? [], body: hit.body };
    if (opts.offline) return { url, status: 0, ms: 0, at: new Date().toISOString(), cached: false, attempts: 0, retried: [], body: null, failure: "offline" };
    const pending = inFlight.get(url) ?? throttle(() => live(url));
    inFlight.set(url, pending);
    try {
      return await pending;
    } finally {
      inFlight.delete(url);
    }
  }

  return { get };
}
