import { describe, expect, it } from "vitest";
import { IMAGE_CAP_BYTES, etagMatches, readCapped, serveImage, type ImageDeps } from "../../src/worker/images.ts";
import type { CacheLike } from "../../src/worker/qloo/caches.ts";
import { imageOrigin } from "../../src/worker/routes/images.ts";
import type { Env } from "../../src/worker/env.ts";

const SITE = "https://fullhouse.example";

function memoryCache(): CacheLike & { keys: string[] } {
  const store = new Map<string, Response>();
  return {
    keys: [],
    async match(req) {
      const hit = store.get(req.url);
      return hit ? hit.clone() : undefined;
    },
    async put(req, res) {
      this.keys.push(req.url);
      store.set(req.url, res.clone());
    },
  };
}

function upstream(body: BodyInit | null, headers: Record<string, string>, status = 200): { deps: Pick<ImageDeps, "fetch">; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    deps: {
      fetch: async (input) => {
        asked.push(String(input));
        return new Response(body, { status, headers });
      },
    },
  };
}

describe("GET /img/*", () => {
  it("fetches the cover from images.qloo.com once and serves it from the cache after", async () => {
    const cache = memoryCache();
    const up = upstream(new Uint8Array([1, 2, 3]), { "content-type": "image/jpeg", etag: '"abc"' });
    const deps = { ...up.deps, cache };
    const first = await serveImage(new Request(`${SITE}/img/i/a-420x-auto.jpg`), deps);
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("image/jpeg");
    expect(first.headers.get("cache-control")).toBe("public, max-age=604800, immutable");
    expect(first.headers.get("etag")).toBe('"abc"');
    expect(first.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    const second = await serveImage(new Request(`${SITE}/img/i/a-420x-auto.jpg`), deps);
    expect(second.status).toBe(200);
    expect(up.asked).toEqual(["https://images.qloo.com/i/a-420x-auto.jpg"]);
    expect(cache.keys).toEqual(["https://images.qloo.com/i/a-420x-auto.jpg"]);
  });

  it("answers 304 when the browser already has the same ETag", async () => {
    const up = upstream(new Uint8Array([1]), { "content-type": "image/png", etag: '"v1"' });
    const res = await serveImage(new Request(`${SITE}/img/i/a.png`, { headers: { "if-none-match": 'W/"v1"' } }), { ...up.deps, cache: null });
    expect(res.status).toBe(304);
    expect(res.headers.get("etag")).toBe('"v1"');
  });

  it("refuses a path off the image host without asking anyone", async () => {
    const up = upstream(new Uint8Array([1]), { "content-type": "image/jpeg" });
    for (const path of ["/img/i/..%2f..%2fapi.jpg", "/img/i/%2e%2e/api/health", "/img/api/health", "/img/i/a.svg"]) {
      const res = await serveImage(new Request(`${SITE}${path}`), { ...up.deps, cache: null });
      expect(res.status, path).toBe(404);
    }
    expect(up.asked).toEqual([]);
  });

  it("refuses anything that is not a raster image, SVG included", async () => {
    for (const type of ["image/svg+xml", "text/html", "application/json", ""]) {
      const up = upstream("<svg/>", type ? { "content-type": type } : {});
      const res = await serveImage(new Request(`${SITE}/img/i/a.jpg`), { ...up.deps, cache: null });
      expect(res.status, type).toBe(502);
      expect(res.headers.get("content-type")).toContain("text/plain");
    }
  });

  it("refuses images over 2 MB, by header and by length read", async () => {
    const declared = upstream(new Uint8Array(4), { "content-type": "image/jpeg", "content-length": String(IMAGE_CAP_BYTES + 1) });
    expect((await serveImage(new Request(`${SITE}/img/i/a.jpg`), { ...declared.deps, cache: null })).status).toBe(502);
    const big = new Response(new Uint8Array(IMAGE_CAP_BYTES + 10));
    expect(await readCapped(big, IMAGE_CAP_BYTES)).toBeNull();
    expect((await readCapped(new Response(new Uint8Array(10)), IMAGE_CAP_BYTES))?.byteLength).toBe(10);
  });

  it("passes a missing image on as not found and a redirect as a failure", async () => {
    const missing = upstream(null, {}, 404);
    expect((await serveImage(new Request(`${SITE}/img/i/a.jpg`), { ...missing.deps, cache: null })).status).toBe(404);
    const moved = upstream(null, { location: "https://evil.example/a.jpg" }, 302);
    expect((await serveImage(new Request(`${SITE}/img/i/a.jpg`), { ...moved.deps, cache: null })).status).toBe(502);
  });

  it("matches ETags the way browsers send them", () => {
    expect(etagMatches('"a", "b"', '"b"')).toBe(true);
    expect(etagMatches("*", '"b"')).toBe(true);
    expect(etagMatches('"a"', '"b"')).toBe(false);
    expect(etagMatches(null, '"b"')).toBe(false);
  });

  it("takes the fake server's origin only as an http or https origin", () => {
    const env = (base?: string) => ({ QLOO_IMAGE_BASE: base }) as Env;
    expect(imageOrigin(env())).toBe("https://images.qloo.com");
    expect(imageOrigin(env("http://127.0.0.1:4000/x"))).toBe("http://127.0.0.1:4000");
    expect(imageOrigin(env("file:///etc"))).toBe("https://images.qloo.com");
    expect(imageOrigin(env("not a url"))).toBe("https://images.qloo.com");
  });
});
