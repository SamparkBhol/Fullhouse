import { describe, expect, it, vi } from "vitest";
import { QlooError, classify, createQloo, type QlooCache } from "../../src/core/index.ts";
import { fakeFetch, type Reply } from "../fixtures/street.ts";

const KEY = "test-key-123";
const ok = (body: unknown): Reply => ({ status: 200, body });

function client(replies: Reply[], extra: Record<string, unknown> = {}) {
  let i = 0;
  const f = fakeFetch([() => replies[Math.min(i++, replies.length - 1)]]);
  const sleep = vi.fn(async () => {});
  const q = createQloo({ apiKey: KEY, fetch: f.fetch, sleep, now: () => new Date("2026-10-25T10:00:00Z"), ...extra });
  return { q, calls: f.calls, sleep };
}

describe("createQloo", () => {
  it("sends the key as X-Api-Key and never in the URL or provenance", async () => {
    const { q, calls } = client([ok({ success: true, results: [{ entity_id: "A", name: "A" }] })]);
    const r = await q.get("find", "/search", { query: "Balthazar", types: "urn:entity:place" });
    expect(calls[0]?.headers["x-api-key"]).toBe(KEY);
    expect(calls[0]?.url.href).not.toContain(KEY);
    expect(calls[0]?.url.origin).toBe("https://hackathon.api.qloo.com");
    expect(JSON.stringify(r.prov)).not.toContain(KEY);
    expect(r.prov).toMatchObject({ call: "find", endpoint: "/search", params: { query: "Balthazar", types: "urn:entity:place" }, resultCount: 1, cached: false, at: "2026-10-25T10:00:00.000Z" });
    expect(typeof r.prov.ms).toBe("number");
  });

  it("retries 429 and 5xx at most twice with backoff", async () => {
    const r429: Reply = { status: 429, body: { code: 429, reason: "Too Many Requests", message: "slow down" } };
    const a = client([r429, r429, ok({ results: [] })]);
    await expect(a.q.get("x", "/search", { query: "a" })).resolves.toBeTruthy();
    expect(a.calls).toHaveLength(3);
    expect(a.sleep).toHaveBeenCalledTimes(2);
    expect(a.sleep.mock.calls.map((c) => (c as unknown[])[0])).toEqual([400, 800]);

    const r500: Reply = { status: 503, body: { message: "busy" } };
    const b = client([r500, r500, r500, ok({})]);
    const err = await b.q.get("x", "/search", { query: "a" }).catch((e) => e);
    expect(err).toBeInstanceOf(QlooError);
    expect(err.kind).toBe("server");
    expect(err.status).toBe(503);
    expect(b.calls).toHaveLength(3);
  });

  it("honours Retry-After within the cap", async () => {
    const a = client([{ status: 429, body: {}, headers: { "retry-after": "2" } }, ok({ results: [] })]);
    await a.q.get("x", "/search", { query: "a" });
    expect(a.sleep).toHaveBeenCalledWith(2000);
  });

  it("does not retry client errors and classifies them", async () => {
    const cases: Array<[Reply, string]> = [
      [{ status: 401, body: { error: { reason: "API keys mismatch", message: "Unauthorized", code: 401 } } }, "auth"],
      [{ status: 403, body: { message: "You do not have permission to access urn:entity:music" } }, "bad_request"],
      [{ status: 403, body: { message: "Forbidden" } }, "auth"],
      [{ status: 404, body: { code: 404, message: "No results" } }, "not_found"],
      [{ status: 400, body: { code: 400, reason: "Bad Request", message: "at least one valid signal or filter is required" } }, "bad_request"],
    ];
    for (const [reply, kind] of cases) {
      const c = client([reply, ok({})]);
      const err = await c.q.get("x", "/v2/insights", { "filter.type": "urn:tag" }).catch((e) => e);
      expect(err).toBeInstanceOf(QlooError);
      expect(err.kind).toBe(kind);
      expect(c.calls).toHaveLength(1);
      expect(err.message).not.toContain(KEY);
    }
    expect(classify(502, "")).toBe("server");
  });

  it("reports network failures and timeouts without retrying", async () => {
    const n = client(["throw", ok({})]);
    expect((await n.q.get("x", "/search", { query: "a" }).catch((e) => e)).kind).toBe("network");
    expect(n.calls).toHaveLength(1);

    const t = client(["hang"], { timeoutMs: 20 });
    const err = await t.q.get("x", "/search", { query: "a" }).catch((e) => e);
    expect(err.kind).toBe("timeout");
    expect(t.calls).toHaveLength(1);
  });

  it("treats a 200 that is not JSON as a server error", async () => {
    const f = async () => new Response("<html>", { status: 200 });
    const q = createQloo({ apiKey: KEY, fetch: f as typeof fetch });
    expect((await q.get("x", "/search", { query: "a" }).catch((e) => e)).kind).toBe("server");
  });

  it("asks the budget before every network attempt", async () => {
    const budget = vi.fn(async () => true);
    const c = client([{ status: 500, body: {} }, ok({ results: [] })], { budget });
    await c.q.get("x", "/search", { query: "a" });
    expect(budget).toHaveBeenCalledTimes(2);
    expect(budget).toHaveBeenCalledWith(1);

    const spent = client([ok({})], { budget: async () => false });
    const err = await spent.q.get("x", "/search", { query: "a" }).catch((e) => e);
    expect(err.kind).toBe("budget");
    expect(spent.calls).toHaveLength(0);
  });

  it("caches by the keyless URL for a day and labels cache hits", async () => {
    const store = new Map<string, unknown>();
    const puts: Array<[string, number]> = [];
    const cache: QlooCache = {
      async get(k) {
        return store.get(k);
      },
      async put(k, body, ttl) {
        puts.push([k, ttl]);
        store.set(k, body);
      },
    };
    let now = new Date("2026-10-25T10:00:00Z");
    const f = fakeFetch([() => ok({ success: true, results: { entities: [{ entity_id: "A", name: "A" }] } })]);
    const q = createQloo({ apiKey: KEY, fetch: f.fetch, cache, now: () => now });
    const first = await q.get("x", "/v2/insights", { "filter.type": "urn:entity:artist", take: "5" });
    now = new Date("2026-10-25T18:00:00Z");
    const second = await q.get("x", "/v2/insights", { take: "5", "filter.type": "urn:entity:artist" });
    expect(f.calls).toHaveLength(1);
    expect(puts).toEqual([["https://hackathon.api.qloo.com/v2/insights?filter.type=urn%3Aentity%3Aartist&take=5", 86400]]);
    expect(first.prov.cached).toBe(false);
    expect(second.prov).toMatchObject({ cached: true, at: "2026-10-25T10:00:00.000Z", resultCount: 1 });
    expect(second.body).toEqual(first.body);
  });

  it("survives a broken cache", async () => {
    const cache: QlooCache = {
      async get() {
        throw new Error("down");
      },
      async put() {
        throw new Error("down");
      },
    };
    const f = fakeFetch([() => ok({ results: [] })]);
    const q = createQloo({ apiKey: KEY, fetch: f.fetch, cache });
    await expect(q.get("x", "/search", { query: "a" })).resolves.toBeTruthy();
  });

  it("refuses bad setups and POINT filters without a radius before calling", async () => {
    expect(() => createQloo({ apiKey: "" })).toThrow(QlooError);
    expect(() => createQloo({ apiKey: KEY, baseUrl: "http://example.com" })).toThrow(QlooError);
    expect(() => createQloo({ apiKey: KEY, baseUrl: "http://127.0.0.1:8787" })).not.toThrow();
    const c = client([ok({})]);
    const err = await c.q.get("x", "/v2/insights", { "filter.type": "urn:entity:place", "filter.location": "POINT(-73.99 40.72)" }).catch((e) => e);
    expect(err.kind).toBe("bad_request");
    expect(c.calls).toHaveLength(0);
  });

  it("uses a custom base URL for the local fake server", async () => {
    const f = fakeFetch([() => ok({ results: [] })]);
    const q = createQloo({ apiKey: KEY, baseUrl: "http://127.0.0.1:9999/", fetch: f.fetch });
    await q.get("x", "/search", { query: "a" });
    expect(f.calls[0]?.url.href).toBe("http://127.0.0.1:9999/search?query=a");
  });

  it("posts JSON bodies with the key in the header only", async () => {
    const seen: RequestInit[] = [];
    const f = async (_u: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init ?? {});
      return new Response(JSON.stringify({ results: { entities: [] } }), { status: 200 });
    };
    const q = createQloo({ apiKey: KEY, fetch: f as typeof fetch });
    const r = await q.post!("x", "/v2/insights", { "filter.type": "urn:entity:place" }, { "signal.interests.entities.query": [{ name: "Nobu" }] });
    expect(seen[0]?.method).toBe("POST");
    expect(String(seen[0]?.body)).toContain("Nobu");
    expect(r.prov.params["body.signal.interests.entities.query"]).toContain("Nobu");
    expect(JSON.stringify(r.prov)).not.toContain(KEY);
  });
});
