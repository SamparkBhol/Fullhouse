import { QLOO_IMAGE_ORIGIN, upstreamImage } from "../shared/images.ts";
import type { CacheLike } from "./qloo/caches.ts";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
export const IMAGE_CAP_BYTES = 2 * 1024 * 1024;
export const IMAGE_MAX_AGE_S = 7 * 24 * 60 * 60;
const UPSTREAM_TIMEOUT_MS = 10_000;

export interface ImageDeps {
  fetch: typeof fetch;
  cache: CacheLike | null;
  origin?: string;
}

const SAFE_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; sandbox",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
};

function refuse(status: number, text: string): Response {
  return new Response(`${text}\n`, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": status === 404 ? "public, max-age=3600" : "no-store", ...SAFE_HEADERS },
  });
}

// SVG is left out on purpose: opened on its own it is a document that can run script on this origin.
function imageType(res: Response): string | null {
  const t = (res.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return IMAGE_TYPES.includes(t) ? t : null;
}

export async function readCapped(res: Response, cap: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > cap) {
    await res.body?.cancel();
    return null;
  }
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export function etagMatches(header: string | null, etag: string | null): boolean {
  if (!header || !etag) return false;
  const bare = (t: string): string => t.trim().replace(/^W\//, "");
  return header.split(",").some((t) => t.trim() === "*" || bare(t) === bare(etag));
}

function imageHeaders(type: string, etag: string | null): Record<string, string> {
  return { "content-type": type, "cache-control": `public, max-age=${IMAGE_MAX_AGE_S}, immutable`, ...(etag ? { etag } : {}), ...SAFE_HEADERS };
}

async function fromQloo(upstream: string, deps: ImageDeps): Promise<Response> {
  let res: Response;
  try {
    res = await deps.fetch(upstream, { headers: { accept: IMAGE_TYPES.join(", ") }, redirect: "manual", signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  } catch {
    return refuse(502, "Qloo's image host did not answer.");
  }
  if (res.status !== 200) {
    await res.body?.cancel();
    return refuse(res.status === 404 || res.status === 403 ? 404 : 502, "Qloo has no image at this address.");
  }
  const type = imageType(res);
  if (!type) {
    await res.body?.cancel();
    return refuse(502, "Qloo answered with something that is not an image.");
  }
  const body = await readCapped(res, IMAGE_CAP_BYTES);
  if (!body) return refuse(502, "The image is larger than 2 MB, so it is not served.");
  return new Response(body, { status: 200, headers: imageHeaders(type, res.headers.get("etag")) });
}

export async function serveImage(request: Request, deps: ImageDeps): Promise<Response> {
  const url = new URL(request.url);
  const upstream = upstreamImage(url.pathname, url.search, deps.origin ?? QLOO_IMAGE_ORIGIN);
  if (!upstream) return refuse(404, "Only Qloo images are served here.");
  const key = new Request(upstream);
  let image = deps.cache ? await deps.cache.match(key).catch(() => undefined) : undefined;
  if (!image) {
    image = await fromQloo(upstream, deps);
    if (image.status !== 200) return image;
    if (deps.cache) await deps.cache.put(key, image.clone()).catch(() => undefined);
  }
  const etag = image.headers.get("etag");
  if (etagMatches(request.headers.get("if-none-match"), etag)) {
    await image.body?.cancel();
    const headers = imageHeaders(image.headers.get("content-type") ?? "image/jpeg", etag);
    delete headers["content-type"];
    return new Response(null, { status: 304, headers });
  }
  return new Response(image.body, { status: 200, headers: imageHeaders(image.headers.get("content-type") ?? "image/jpeg", etag) });
}
