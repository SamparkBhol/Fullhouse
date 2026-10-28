import type { Hono } from "hono";
import { STATS_RANGES, type StatsBody, type StatsRange } from "../../shared/stats.ts";
import { BurstLimiter } from "../burst.ts";
import { apiError } from "../http.ts";
import { EdgeStatsCache, type CachedStats } from "../stats/edge_cache.ts";
import { conditional, etagOf } from "../stats/etag.ts";
import { renderLiveText } from "../stats/text.ts";
import { HttpError, refuseBurst, send, type AppDeps, type AppEnv, type Ctx } from "./shared.ts";

const PER_MINUTE = 30;

const TEXT_HEADERS = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "no-cache",
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
};

export function rangeOf(raw: string | undefined): StatsRange | null {
  if (raw === undefined || raw === "") return "24h";
  return (STATS_RANGES as readonly string[]).includes(raw) ? (raw as StatsRange) : null;
}

export function statsRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  const edge = new EdgeStatsCache();
  const publicBurst = new BurstLimiter(PER_MINUTE, 60_000);
  const ownerBurst = new BurstLimiter(PER_MINUTE, 60_000);

  function cached(c: Ctx, range: StatsRange): Promise<CachedStats> {
    const api = deps.stats?.(c.env);
    if (!api) throw new HttpError(503, "stats_off", "This server keeps no stats.");
    return edge.get(range, () => api.stats(range));
  }

  app.get("/api/stats", async (c) => {
    const range = rangeOf(c.req.query("range"));
    if (!range) return apiError(400, "invalid_range", "Ask for range 24h, 7d or 30d.");
    const limited = await refuseBurst(c, publicBurst);
    if (limited) return limited;
    const { body, etag } = await cached(c, range);
    return conditional(c.req.header("if-none-match"), body, etag, { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" });
  });

  app.get("/live.txt", async (c) => {
    const range = rangeOf(c.req.query("range"));
    if (!range) return new Response("Ask for range 24h, 7d or 30d.\n", { status: 400, headers: TEXT_HEADERS });
    const limited = await refuseBurst(c, publicBurst);
    if (limited) return limited;
    const { body, etag } = await cached(c, range);
    const text = renderLiveText(JSON.parse(body) as StatsBody);
    return conditional(c.req.header("if-none-match"), text, etag.replace(/"$/, 't"'), TEXT_HEADERS);
  });

  app.get("/api/venues/:id/dashboard", async (c) => {
    const limited = await refuseBurst(c, ownerBurst);
    if (limited) return limited;
    const out = await c.var.venue.dashboard();
    if (!out.ok) return send(out);
    const body = JSON.stringify(out.value);
    return conditional(c.req.header("if-none-match"), body, await etagOf(body), {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-cache",
    });
  });
}
