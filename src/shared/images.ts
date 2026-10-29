export const QLOO_IMAGE_ORIGIN = "https://images.qloo.com";
export const IMAGE_ROUTE = "/img/";

// Every image Qloo returned in the live probe sits at /i/<name>.jpg, so nothing else is fetched. The runtime has
// already resolved "%2e%2e" by the time a path arrives, so a strict shape is what keeps /img/ on image files.
const PATH = /^i\/[A-Za-z0-9][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*\.(?:jpe?g|png|webp|gif|avif)$/i;
const QUERY = /^[A-Za-z0-9._~=&,-]*$/;
const MAX_PATH = 300;
const MAX_QUERY = 200;

function cleanPath(path: string): string | null {
  return path.length <= MAX_PATH && PATH.test(path) ? path : null;
}

function cleanQuery(search: string): string | null {
  const q = search.startsWith("?") ? search.slice(1) : search;
  if (q.length > MAX_QUERY || !QUERY.test(q)) return null;
  return q;
}

// The same origin path for a Qloo image, or null for any other URL, so the browser never asks Qloo itself.
// The raw text is checked too, because URL parsing quietly resolves "%2e%2e" and backslashes before the path is seen.
export function proxiedImage(url: string | undefined | null): string | null {
  if (!url || /[%\\]|\/\.|\s/.test(url)) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.origin !== QLOO_IMAGE_ORIGIN || u.username || u.password || u.hash) return null;
  const path = cleanPath(u.pathname.slice(1));
  const query = cleanQuery(u.search);
  if (path === null || query === null) return null;
  return `${IMAGE_ROUTE}${path}${query ? `?${query}` : ""}`;
}

// The Qloo URL behind /img/<path>?<query>, or null when the request tries to reach anything else.
export function upstreamImage(pathname: string, search: string, origin: string = QLOO_IMAGE_ORIGIN): string | null {
  if (!pathname.startsWith(IMAGE_ROUTE)) return null;
  const path = cleanPath(pathname.slice(IMAGE_ROUTE.length));
  const query = cleanQuery(search);
  if (path === null || query === null) return null;
  return `${origin}/${path}${query ? `?${query}` : ""}`;
}
