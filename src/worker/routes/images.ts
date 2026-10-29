import type { Hono } from "hono";
import { QLOO_IMAGE_ORIGIN } from "../../shared/images.ts";
import { BurstLimiter } from "../burst.ts";
import type { Env } from "../env.ts";
import { serveImage } from "../images.ts";
import { openCache } from "../qloo/caches.ts";
import { refuseBurst, type AppEnv } from "./shared.ts";

// A street read shows about sixty covers and photos, so a page load stays well under this.
const PER_MINUTE = 300;

// QLOO_IMAGE_BASE exists for the local fake server in e2e, the same way QLOO_BASE_URL does; wrangler.toml never sets it.
export function imageOrigin(env: Env): string {
  const raw = env.QLOO_IMAGE_BASE?.trim();
  if (!raw) return QLOO_IMAGE_ORIGIN;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : QLOO_IMAGE_ORIGIN;
  } catch {
    return QLOO_IMAGE_ORIGIN;
  }
}

export function imageRoutes(app: Hono<AppEnv>): void {
  const burst = new BurstLimiter(PER_MINUTE, 60_000);
  app.get("/img/*", async (c) => {
    const limited = await refuseBurst(c, burst);
    if (limited) return limited;
    return serveImage(c.req.raw, { fetch: (input, init) => fetch(input, init), cache: await openCache("img"), origin: imageOrigin(c.env) });
  });
}
