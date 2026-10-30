import type { Hono } from "hono";
import { BurstLimiter } from "../burst.ts";
import { VENUE_ID_RE } from "../ids.ts";
import { handleMcp, MCP_VERSION } from "../mcp.ts";
import { toolRows } from "../mcp_defs.ts";
import type { LimitKind } from "../meter_core.ts";
import { recordEvent } from "../stats/events.ts";
import type { Out } from "../venue/api.ts";
import { asOut, HttpError, isBodyLimit, json, limit, refuseBurst, searchVenues, type AppDeps, type AppEnv, type Ctx } from "./shared.ts";

const PARSE_ERROR = { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null };
const PER_MINUTE = 60;

async function limited(c: Ctx, deps: AppDeps, kind: LimitKind): Promise<Out<never> | null> {
  try {
    await limit(c, deps, kind);
    return null;
  } catch (err) {
    if (err instanceof HttpError) return asOut<never>(err);
    throw err;
  }
}

export function mcpRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  const burst = new BurstLimiter(PER_MINUTE, 60_000);

  app.post("/mcp", async (c) => {
    const refused = await refuseBurst(c, burst);
    if (refused) return refused;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await c.req.text());
    } catch (err) {
      if (isBodyLimit(err)) throw err;
      return json(PARSE_ERROR, 400);
    }
    return handleMcp(c.req.raw, parsed, {
      origin: new URL(c.req.url).origin,
      // Only a call that reached one of the five tools and came back without an error is counted and logged.
      toolDone: (tool, ok) => {
        if (ok) recordEvent(c.var.stats, { kind: "mcp_call", tool });
      },
      findVenues: async (name, city) => (await limited(c, deps, "search")) ?? searchVenues(c, deps, name, city),
      limit: (kind) => limited(c, deps, kind),
      owner: async (venueId, token) => {
        if (!VENUE_ID_RE.test(venueId)) return null;
        const venue = deps.venue(c.env, venueId);
        return (await venue.ownerCheck(venueId, token)) ? venue : null;
      },
    });
  });

  app.get("/api/mcp/tools", (c) => json({ endpoint: `${new URL(c.req.url).origin}/mcp`, name: "fullhouse", version: MCP_VERSION, tools: toolRows() }));

  app.on(["GET", "DELETE"], "/mcp", () =>
    json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. This MCP server is stateless; send POST." }, id: null }, 405, { allow: "POST, OPTIONS" }),
  );
}
