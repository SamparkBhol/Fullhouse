import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Qloo } from "../core/index.ts";
import type { VenueCandidate } from "../shared/contract.ts";
import { modelOf, resendOf, type Env } from "./env.ts";
import {
  API_HEADERS,
  apiError,
  BODY_LIMIT,
  bearer,
  corsHeaders,
  ipKey,
  originAllowed,
  pageCsp,
  pageHeaders,
  preflight,
  readCookie,
  setCookie,
  withHeaders,
} from "./http.ts";
import { handleMcp, MCP_VERSION } from "./mcp.ts";
import type { LimitKind, MeterApi } from "./meter_core.ts";
import { renderEventPage, renderIcs, renderMissing, renderPoster } from "./pages/event.ts";
import { FONT_PATH, pageHashes } from "./pages/style.ts";
import { buildQloo, cacheApiCache, isQlooError, qlooFailure, QLOO_KEY_MISSING, type CreateQloo } from "./qloo_wiring.ts";
import { venueIdFromSlug } from "./slug.ts";
import { newVenueId, NIGHT_ID_RE, ownerToken, ownerUrl, randomId, sha256hex, VENUE_ID_RE, verifyOwnerToken } from "./tokens.ts";
import {
  ApproveSchema,
  cleanPlanInput,
  CreateVenueSchema,
  EventbriteSchema,
  parse,
  PlanInputSchema,
  RefineSchema,
  ResultSchema,
  SearchSchema,
} from "./validate.ts";
import type { Out, VenueApi } from "./venue_core.ts";

export interface AppDeps {
  createQloo: CreateQloo;
  findVenues(q: Qloo, name: string, city: string): Promise<VenueCandidate[]>;
  venue(env: Env, id: string): VenueApi;
  meter(env: Env): MeterApi;
  font?: ArrayBuffer;
}

type AppEnv = { Bindings: Env; Variables: { venue: VenueApi; venueId: string } };
type Ctx = Context<AppEnv>;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail?: string,
  ) {
    super(code);
  }
}

const BROWSER_COOKIE = "fh_b";
const BROWSER_RE = /^[a-km-np-z2-9]{22}$/;

function json(value: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...API_HEADERS, ...extra },
  });
}

function send<T>(out: Out<T>, status = 200): Response {
  return out.ok ? json(out.value, status) : apiError(out.status, out.error, out.detail);
}

async function readBody(c: Ctx): Promise<unknown> {
  const type = c.req.header("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) throw new HttpError(415, "unsupported_media_type", "Send JSON with content-type application/json.");
  let text: string;
  try {
    text = await c.req.text();
  } catch (err) {
    if (isBodyLimit(err)) throw err;
    throw new HttpError(400, "invalid_body", "The body could not be read.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "invalid_json", "The body is not valid JSON.");
  }
}

// Hono's bodyLimit only answers 413 when its own error reaches the app error handler.
function isBodyLimit(err: unknown): boolean {
  return err instanceof Error && err.name === "BodyLimitError";
}

function secretOf(env: Env): string {
  const s = env.TOKEN_SECRET?.trim();
  if (!s) throw new HttpError(503, "token_secret_missing", "TOKEN_SECRET is not set on this server, so owner links cannot be issued or checked.");
  return s;
}

async function limit(c: Ctx, deps: AppDeps, kind: LimitKind): Promise<void> {
  const key = await ipKey(c.req.raw, c.env.TOKEN_SECRET ?? "fullhouse");
  const r = await deps.meter(c.env).hit(key, kind);
  if (!r.ok) {
    throw Object.assign(new HttpError(429, "rate_limited", `Daily limit for this kind of request reached. Try again in ${Math.ceil(r.retryAfterS / 3600)} hours.`), {
      retryAfter: r.retryAfterS,
    });
  }
}

function workerQloo(c: Ctx, deps: AppDeps): Qloo {
  const q = buildQloo(c.env, deps.createQloo, cacheApiCache(4), deps.meter(c.env));
  if (!q) throw new HttpError(QLOO_KEY_MISSING.status, QLOO_KEY_MISSING.error, QLOO_KEY_MISSING.detail);
  return q;
}

async function search(c: Ctx, deps: AppDeps, name: string, city: string): Promise<Out<VenueCandidate[]>> {
  try {
    return { ok: true, value: await deps.findVenues(workerQloo(c, deps), name, city) };
  } catch (err) {
    if (err instanceof HttpError) return { ok: false, status: err.status, error: err.code, ...(err.detail ? { detail: err.detail } : {}) };
    if (isQlooError(err)) {
      const f = qlooFailure(err);
      console.error("venue search failed", err.kind, err.status);
      return { ok: false, status: f.status, error: f.error, detail: f.detail };
    }
    throw err;
  }
}

async function browserKey(c: Ctx, cookie: string): Promise<string> {
  return (await sha256hex(`${c.env.TOKEN_SECRET ?? "fullhouse"}|browser|${cookie}`)).slice(0, 24);
}

async function pageResponse(html: string, status = 200, script = false): Promise<Response> {
  const h = await pageHashes();
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...pageHeaders(pageCsp(h.style, script ? h.script : undefined)) },
  });
}

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.onError(async (err, c) => {
    if (isBodyLimit(err)) return apiError(413, "body_too_large", "Bodies are capped at 64 KB.");
    if (err instanceof HttpError) {
      const res = apiError(err.status, err.code, err.detail);
      const retry = (err as HttpError & { retryAfter?: number }).retryAfter;
      if (retry) res.headers.set("retry-after", String(retry));
      return c.req.path.startsWith("/e/") && err.status !== 429 ? pageResponse(renderMissing(), err.status) : res;
    }
    console.error("unhandled", err instanceof Error ? err.message : String(err));
    if (c.req.path.startsWith("/e/")) return pageResponse(renderMissing(), 500);
    return apiError(500, "internal", "Something went wrong on our side. It was logged.");
  });

  app.use("*", async (c, next) => {
    const path = c.req.path;
    const isApi = path.startsWith("/api/") || path === "/mcp" || path.startsWith("/mcp/");
    if (!isApi) return next();
    if (c.req.method === "OPTIONS") return preflight(c.req.raw, c.env);
    if (c.req.method !== "GET" && c.req.method !== "HEAD" && !originAllowed(c.req.raw, c.env)) {
      return withHeaders(apiError(403, "origin_not_allowed", "This API only answers its own site."), corsHeaders(c.req.raw, c.env));
    }
    await next();
    c.res = withHeaders(c.res, { ...API_HEADERS, ...corsHeaders(c.req.raw, c.env) });
  });

  const capped = bodyLimit({ maxSize: BODY_LIMIT, onError: () => apiError(413, "body_too_large", "Bodies are capped at 64 KB.") });
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

  app.post("/api/venues/search", async (c) => {
    const p = parse(SearchSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    await limit(c, deps, "search");
    return send(await search(c, deps, p.value.name, p.value.city));
  });

  app.post("/api/venues", async (c) => {
    const p = parse(CreateVenueSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    const secret = secretOf(c.env);
    await limit(c, deps, "create");
    const found = await search(c, deps, p.value.candidate.name, p.value.city);
    if (!found.ok) return send(found);
    const candidate = found.value.find((v) => v.id === p.value.candidate.id);
    if (!candidate) {
      return apiError(409, "candidate_not_found", "Qloo did not return that place again for this name and city. Search once more and pick it from the new list.");
    }
    const id = newVenueId();
    const input = { ...p.value, candidate };
    const out = await deps.venue(c.env, id).init(id, input, candidate, new URL(c.req.url).origin);
    if (!out.ok) return send(out);
    const token = await ownerToken(secret, id);
    return json({ venue: out.value, ownerToken: token, ownerUrl: ownerUrl(new URL(c.req.url).origin, id, token) }, 201);
  });

  const owner = async (c: Ctx, next: () => Promise<void>): Promise<Response | void> => {
    const id = c.req.param("id") ?? "";
    if (!VENUE_ID_RE.test(id)) return apiError(404, "venue_not_found", "No venue with that id.");
    const secret = secretOf(c.env);
    if (!(await verifyOwnerToken(secret, id, bearer(c.req.raw)))) {
      return apiError(401, "unauthorized", "This needs the owner link for this venue.");
    }
    c.set("venueId", id);
    c.set("venue", deps.venue(c.env, id));
    await next();
  };
  app.use("/api/venues/:id", owner);
  app.use("/api/venues/:id/*", owner);

  app.get("/api/venues/:id", async (c) => send(await c.var.venue.state()));
  app.delete("/api/venues/:id", async (c) => send(await c.var.venue.destroy()));
  app.post("/api/venues/:id/read", async (c) => send(await c.var.venue.read()));

  app.post("/api/venues/:id/plan", async (c) => {
    const p = parse(PlanInputSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    return send(await c.var.venue.plan(cleanPlanInput(p.value)));
  });

  app.post("/api/venues/:id/refine", async (c) => {
    const p = parse(RefineSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    return send(await c.var.venue.refine(p.value.planId, p.value.request));
  });

  app.post("/api/venues/:id/nights/:planId/approve", async (c) => {
    const planId = c.req.param("planId");
    if (!NIGHT_ID_RE.test(planId)) return apiError(404, "plan_not_found", "No plan with that id.");
    const p = parse(ApproveSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    const input = p.value.partnerEmails ? { actions: p.value.actions, partnerEmails: p.value.partnerEmails } : { actions: p.value.actions };
    return send(await c.var.venue.approve(planId, input, new URL(c.req.url).origin));
  });

  app.post("/api/venues/:id/nights/:nightId/result", async (c) => {
    const nightId = c.req.param("nightId");
    if (!NIGHT_ID_RE.test(nightId)) return apiError(404, "night_not_found", "No night with that id.");
    const p = parse(ResultSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    return send(await c.var.venue.result(nightId, p.value.headcount, p.value.note));
  });

  app.post("/api/venues/:id/eventbrite", async (c) => {
    const p = parse(EventbriteSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    return send(await c.var.venue.connectEventbrite(p.value.token));
  });
  app.delete("/api/venues/:id/eventbrite", async (c) => send(await c.var.venue.disconnectEventbrite()));

  app.post("/api/venues/:id/baseline", async (c) => {
    if (!c.env.AI) return apiError(503, "ai_unavailable", "The language model is not available here, so the plain model comparison cannot run.");
    await limit(c, deps, "baseline");
    return send(await c.var.venue.baseline());
  });

  app.all("/api/*", () => apiError(404, "not_found", "No such API route."));

  app.post("/mcp", async (c) => {
    let text: string;
    try {
      text = await c.req.text();
    } catch (err) {
      if (isBodyLimit(err)) throw err;
      return json({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }, 400);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }, 400);
    }
    const origin = new URL(c.req.url).origin;
    return handleMcp(c.req.raw, parsed, {
      origin,
      findVenues: async (name, city) => {
        try {
          await limit(c, deps, "search");
        } catch (err) {
          if (err instanceof HttpError) return { ok: false, status: err.status, error: err.code, ...(err.detail ? { detail: err.detail } : {}) };
          throw err;
        }
        return search(c, deps, name, city);
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

  app.get(FONT_PATH, () => {
    if (!deps.font) return new Response("Not found", { status: 404 });
    return new Response(deps.font, {
      headers: {
        "content-type": "font/woff2",
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
        "cross-origin-resource-policy": "same-origin",
      },
    });
  });

  const nightFor = async (c: Ctx, slug: string, withBrowser: boolean) => {
    const venueId = venueIdFromSlug(slug);
    if (!venueId) return null;
    const cookie = readCookie(c.req.raw, BROWSER_COOKIE);
    const browser = withBrowser && cookie && BROWSER_RE.test(cookie) ? await browserKey(c, cookie) : null;
    const out = await deps.venue(c.env, venueId).publicNight(slug, browser);
    return out.ok ? out.value : null;
  };

  app.get("/e/:slug", async (c) => {
    const raw = c.req.param("slug");
    const origin = new URL(c.req.url).origin;
    if (raw.endsWith(".ics")) {
      const slug = raw.slice(0, -4);
      const n = await nightFor(c, slug, false);
      if (!n || !n.published.ics) return pageResponse(renderMissing(), 404);
      return new Response(renderIcs(n, origin, new Date()), {
        headers: {
          "content-type": "text/calendar; charset=utf-8",
          "content-disposition": `attachment; filename="${slug.slice(0, 60)}.ics"`,
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "x-robots-tag": "noindex, nofollow",
        },
      });
    }
    const n = await nightFor(c, raw, true);
    if (!n || !n.published.page) return pageResponse(renderMissing(), 404);
    return pageResponse(renderEventPage(n, origin, new Date()));
  });

  app.get("/e/:slug/poster", async (c) => {
    const n = await nightFor(c, c.req.param("slug"), false);
    if (!n || !n.published.poster) return pageResponse(renderMissing(), 404);
    return pageResponse(renderPoster(n, new URL(c.req.url).origin), 200, true);
  });

  app.post("/e/:slug/rsvp", async (c) => {
    const slug = c.req.param("slug");
    const wantsJson = (c.req.header("accept") ?? "").includes("application/json");
    if (!originAllowed(c.req.raw, c.env) || c.req.header("sec-fetch-site") === "cross-site") {
      return apiError(403, "origin_not_allowed", "Say you are coming from the event page itself.");
    }
    const venueId = venueIdFromSlug(slug);
    if (!venueId) return wantsJson ? apiError(404, "night_not_found") : pageResponse(renderMissing(), 404);
    await limit(c, deps, "rsvp");
    const existing = readCookie(c.req.raw, BROWSER_COOKIE);
    const cookie = existing && BROWSER_RE.test(existing) ? existing : randomId(22);
    const out = await deps.venue(c.env, venueId).rsvp(slug, await browserKey(c, cookie));
    const secure = new URL(c.req.url).protocol === "https:";
    const setC = setCookie(BROWSER_COOKIE, cookie, 60 * 60 * 24 * 365, "/e/", secure);
    if (!out.ok) {
      if (wantsJson) return apiError(out.status, out.error, out.detail);
      return out.status === 404 ? pageResponse(renderMissing(), 404) : c.redirect(`/e/${slug}`, 303);
    }
    if (wantsJson) return json(out.value, 200, { "set-cookie": setC });
    return new Response(null, { status: 303, headers: { location: `/e/${slug}#rsvp`, "set-cookie": setC, "cache-control": "no-store" } });
  });

  app.all("*", async (c) => {
    if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
    return apiError(404, "not_found");
  });

  return app;
}
