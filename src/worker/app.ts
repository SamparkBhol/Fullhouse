import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { modelOf, resendOf } from "./env.ts";
import { API_HEADERS, apiError, BODY_LIMIT, corsHeaders, originAllowed, preflight, withHeaders } from "./http.ts";
import { MCP_VERSION } from "./mcp.ts";
import { renderMissing } from "./pages/event.ts";
import { imageRoutes } from "./routes/images.ts";
import { mcpRoutes } from "./routes/mcp.ts";
import { ownerRoutes } from "./routes/owner.ts";
import { publicRoutes } from "./routes/public.ts";
import { HttpError, isBodyLimit, json, pageResponse, type AppDeps, type AppEnv } from "./routes/shared.ts";
import { statsRoutes } from "./routes/stats.ts";
import { collectStats } from "./stats/collect.ts";

export type { AppDeps } from "./routes/shared.ts";

const TOO_LARGE = "Bodies are capped at 64 KB.";

function isApiPath(path: string): boolean {
  return path.startsWith("/api/") || path === "/mcp" || path.startsWith("/mcp/");
}

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.onError(async (err, c) => {
    if (isBodyLimit(err)) return apiError(413, "body_too_large", TOO_LARGE);
    const page = c.req.path.startsWith("/e/");
    if (err instanceof HttpError) {
      if (page && err.status !== 429) return pageResponse(renderMissing(), err.status);
      const res = apiError(err.status, err.code, err.detail);
      if (err.retryAfter) res.headers.set("retry-after", String(err.retryAfter));
      return res;
    }
    console.error("unhandled", err instanceof Error ? err.message : String(err));
    if (page) return pageResponse(renderMissing(), 500);
    return apiError(500, "internal", "Something went wrong on our side. It was logged.");
  });

  app.use("*", collectStats(deps));
  app.use("*", async (c, next) => {
    if (!isApiPath(c.req.path)) return next();
    if (c.req.method === "OPTIONS") return preflight(c.req.raw, c.env);
    if (c.req.method !== "GET" && c.req.method !== "HEAD" && !originAllowed(c.req.raw, c.env)) {
      return withHeaders(apiError(403, "origin_not_allowed", "This API only answers its own site."), corsHeaders(c.req.raw, c.env));
    }
    await next();
    c.res = withHeaders(c.res, { ...API_HEADERS, ...corsHeaders(c.req.raw, c.env) });
  });

  const capped = bodyLimit({ maxSize: BODY_LIMIT, onError: () => apiError(413, "body_too_large", TOO_LARGE) });
  app.use("/api/*", capped);
  app.use("/mcp", capped);
  app.use("/e/*", capped);

  app.get("/api/health", (c) =>
    json({
      ok: true,
      version: MCP_VERSION,
      qloo: Boolean(c.env.QLOO_API_KEY?.trim()),
      ai: Boolean(c.env.AI),
      model: modelOf(c.env),
      ownerEmail: Boolean(resendOf(c.env)),
      tokens: Boolean(c.env.TOKEN_SECRET?.trim()),
    }),
  );

  ownerRoutes(app, deps);
  statsRoutes(app, deps);
  app.all("/api/*", () => apiError(404, "not_found", "No such API route."));
  mcpRoutes(app, deps);
  publicRoutes(app, deps);
  imageRoutes(app);

  app.all("*", async (c) => {
    if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
    return apiError(404, "not_found");
  });

  return app;
}
