import type { Hono } from "hono";
import { apiError, bearer } from "../http.ts";
import { newVenueId, NIGHT_ID_RE, ownerToken, ownerUrl, VENUE_ID_RE, verifyOwnerToken } from "../tokens.ts";
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
} from "../validate.ts";
import { json, limit, readBody, searchVenues, secretOf, send, type AppDeps, type AppEnv, type Ctx } from "./shared.ts";

function venueRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.post("/api/venues/search", async (c) => {
    const p = parse(SearchSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    await limit(c, deps, "search");
    return send(await searchVenues(c, deps, p.value.name, p.value.city));
  });

  // The candidate is looked up again so a venue is only ever created from a place Qloo returned.
  app.post("/api/venues", async (c) => {
    const p = parse(CreateVenueSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    const secret = secretOf(c.env);
    await limit(c, deps, "create");
    const found = await searchVenues(c, deps, p.value.candidate.name, p.value.city);
    if (!found.ok) return send(found);
    const candidate = found.value.find((v) => v.id === p.value.candidate.id);
    if (!candidate) {
      return apiError(409, "candidate_not_found", "Qloo did not return that place again for this name and city. Search once more and pick it from the new list.");
    }
    const id = newVenueId();
    const origin = new URL(c.req.url).origin;
    const out = await deps.venue(c.env, id).init(id, { ...p.value, candidate }, candidate, origin);
    if (!out.ok) return send(out);
    const token = await ownerToken(secret, id);
    return json({ venue: out.value, ownerToken: token, ownerUrl: ownerUrl(origin, id, token) }, 201);
  });
}

function ownerOnly(deps: AppDeps) {
  return async (c: Ctx, next: () => Promise<void>): Promise<Response | void> => {
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
}

function nightRoutes(app: Hono<AppEnv>): void {
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
}

export function ownerRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  venueRoutes(app, deps);
  app.use("/api/venues/:id", ownerOnly(deps));
  app.use("/api/venues/:id/*", ownerOnly(deps));

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

  nightRoutes(app);

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
}
