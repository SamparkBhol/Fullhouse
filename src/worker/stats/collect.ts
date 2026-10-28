import type { MiddlewareHandler } from "hono";
import type { AppDeps, AppEnv } from "../routes/shared.ts";
import { sendStats, StatsBuffer } from "./buffer.ts";

// Events from one Worker request, such as a venue search or an MCP tool call, go to the Meter once, after the answer.
export function collectStats(deps: AppDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const buffer = new StatsBuffer();
    c.set("stats", buffer);
    await next();
    const events = buffer.take();
    if (!events.length) return;
    const done = sendStats(events, deps.stats?.(c.env) ?? null);
    try {
      c.executionCtx.waitUntil(done);
    } catch {
      await done;
    }
  };
}
