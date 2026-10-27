import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface CachedAnswer {
  url: string;
  status: number;
  ms: number;
  at: string;
  retried?: number[];
  body: unknown;
}

function cacheKey(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

function cacheable(status: number): boolean {
  return status >= 200 && status < 500 && status !== 429;
}

export function diskCache(dir: string) {
  const fileFor = (url: string) => join(dir, `${cacheKey(url)}.json`);

  async function read(url: string): Promise<CachedAnswer | null> {
    try {
      const hit = JSON.parse(await readFile(fileFor(url), "utf8")) as CachedAnswer;
      return hit.url === url ? hit : null;
    } catch {
      return null;
    }
  }

  async function write(answer: CachedAnswer): Promise<void> {
    if (!cacheable(answer.status)) return;
    await mkdir(dir, { recursive: true });
    await writeFile(fileFor(answer.url), JSON.stringify(answer));
  }

  return { read, write };
}

export type DiskCache = ReturnType<typeof diskCache>;
