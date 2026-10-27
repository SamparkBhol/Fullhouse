export const CACHE_TTL_SEC = 86400;

export interface QlooCache {
  get(key: string): Promise<unknown | undefined>;
  put(key: string, body: unknown, ttlSec: number): Promise<void>;
}

export interface CacheEntry {
  fullhouseCache: 1;
  at: string;
  body: unknown;
}

export function cacheEntry(at: string, body: unknown): CacheEntry {
  return { fullhouseCache: 1, at, body };
}

export function isCacheEntry(v: unknown): v is CacheEntry {
  return typeof v === "object" && v !== null && (v as CacheEntry).fullhouseCache === 1 && typeof (v as CacheEntry).at === "string" && "body" in v;
}
