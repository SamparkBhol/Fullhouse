import type { Hono } from "hono";
import { verifyOwnerToken, VENUE_ID_RE } from "../tokens.ts";
import { handleMcp } from "../mcp.ts";
import { asOut, HttpError, isBodyLimit, json, limit, searchVenues, type AppDeps, type AppEnv } from "./shared.ts";

const PARSE_ERROR = { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null };

export function mcpRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.post("/mcp", async (c) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await c.req.text());
    } catch (err) {
      if (isBodyLimit(err)) throw err;
      return json(PARSE_ERROR, 400);
    }
    return handleMcp(c.req.raw, parsed, {
      origin: new URL(c.req.url).origin,
      findVenues: async (name, city) => {
        try {
          await limit(c, deps, "search");
        } catch (err) {
          if (err instanceof HttpError) return asOut(err);
          throw err;
        }
        return searchVenues(c, deps, name, city);
      },
      owner: async (venueId, token) => {
        const secret = c.env.TOKEN_SECRET?.trim();
        if (!secret || !VENUE_ID_RE.test(venueId) || !(await verifyOwnerToken(secret, venueId, token))) return null;
        return deps.venue(c.env, venueId);
      },
    });
  });

  app.on(["GET", "DELETE"], "/mcp", () =>
    json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. This MCP server is stateless; send POST." }, id: null }, 405, { allow: "POST, OPTIONS" }),
  );
}
