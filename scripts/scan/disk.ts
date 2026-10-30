import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Answers are kept one file per URL, named by the URL's hash, so earlier probes and walks are reused as they are.
interface Kept {
  url: string;
  status: number;
  ms: number;
  at: string;
  body: unknown;
}

export interface Ledger {
  live: number;
  cached: number;
  answered: number;
  cap: number;
  left(): number;
}

function fileFor(dir: string, url: string): string {
  return join(dir, `${createHash("sha256").update(url).digest("hex")}.json`);
}

async function read(dir: string, url: string): Promise<Kept | null> {
  try {
    const hit = JSON.parse(await readFile(fileFor(dir, url), "utf8")) as Kept;
    return hit.url === url ? hit : null;
  } catch {
    return null;
  }
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// A fetch for the engine's own client: kept answers first, then the live host while the cap allows and live is on.
export function diskFetch(dir: string, live: boolean, cap: number): { fetch: typeof fetch; ledger: Ledger } {
  const ledger: Ledger = { live: 0, cached: 0, answered: 0, cap, left: () => cap - ledger.live };
  const run = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    const hit = await read(dir, url);
    if (hit) {
      ledger.cached += 1;
      if (hit.status < 300) ledger.answered += 1;
      return reply(hit.status, hit.body);
    }
    if (!live) return reply(503, { errors: [{ message: "not kept, and live calls are off" }] });
    if (ledger.left() <= 0) return reply(503, { errors: [{ message: "the scan reached its cap of live calls" }] });
    ledger.live += 1;
    const started = Date.now();
    const res = await fetch(url, init);
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    if (res.status < 500 && res.status !== 429) {
      await mkdir(dir, { recursive: true });
      await writeFile(fileFor(dir, url), JSON.stringify({ url, status: res.status, ms: Date.now() - started, at: new Date().toISOString(), body }));
    }
    if (res.ok) ledger.answered += 1;
    return reply(res.status, body);
  };
  return { fetch: run as typeof fetch, ledger };
}
