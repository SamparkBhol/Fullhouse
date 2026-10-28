import { cacheEntry, isCacheEntry, type QlooCache } from "../../src/core/qloo/cache.ts";
import type { DiskCache } from "../probe/cache.ts";

// The probe stored raw answers with their HTTP status; the app's client expects its own cache entries.
export function qlooDiskCache(disk: DiskCache): QlooCache {
  return {
    async get(url) {
      const hit = await disk.read(url);
      return hit && hit.status === 200 ? cacheEntry(hit.at, hit.body) : undefined;
    },
    async put(url, entry) {
      if (!isCacheEntry(entry)) return;
      await disk.write({ url, status: 200, ms: 0, at: entry.at, body: entry.body });
    },
  };
}
