import type { Hono } from "hono";
import type { ApproveInput } from "../../shared/contract.ts";
import { apiError, bearer } from "../http.ts";
import { newVenueId, NIGHT_ID_RE, VENUE_ID_RE } from "../ids.ts";
import { ownerUrl } from "../owner_token.ts";
import { venueIdFromInviteSlug } from "../slug.ts";
import {
  ApproveSchema,
  cleanPlanInput,
  cleanSettings,
  ConfirmSchema,
  EditSchema,
  CreateVenueSchema,
  EmailSchema,
  EventbriteSchema,
  InviteSchema,
  MatchSchema,
  parse,
  PlanInputSchema,
  RefineSchema,
  ResultSchema,
  SearchSchema,
  SettingsSchema,
} from "../validate.ts";
import { json, limit, readBody, searchVenues, secretOf, send, type AppDeps, type AppEnv, type Ctx } from "./shared.ts";

function originOf(c: Ctx): string {
  return new URL(c.req.url).origin;
}

// The venue whose invite led here hears that its partner set up its own. A bad or stale link never stops the setup.
async function noteJoined(c: Ctx, deps: AppDeps, via: string, newId: string, entityId: string): Promise<void> {
  const from = venueIdFromInviteSlug(via);
  if (!from || from === newId) return;
  try {
    await deps.venue(c.env, from).joined(via, entityId);
  } catch (err) {
    console.error("joined note failed", err instanceof Error ? err.message : String(err));
  }
}

function venueRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.post("/api/venues/search", async (c) => {
    const p = parse(SearchSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    await limit(c, deps, "search");
    return send(await searchVenues(c, deps, p.value.name, p.value.city ?? "", p.value.near));
  });

  // The candidate is looked up again so a venue is only ever created from a place Qloo returned.
  app.post("/api/venues", async (c) => {
    const p = parse(CreateVenueSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    secretOf(c.env);
    await limit(c, deps, "create");
    const found = await searchVenues(c, deps, p.value.candidate.name, p.value.city, p.value.near);
    if (!found.ok) return send(found);
    const candidate = found.value.find((v) => v.id === p.value.candidate.id);
    if (!candidate) {
      return apiError(409, "candidate_not_found", "That place did not come back again for this name and city. Search once more and pick it from the new list.");
    }
    const id = newVenueId();
    const origin = originOf(c);
    const { near: _near, via, ...input } = p.value;
    const out = await deps.venue(c.env, id).init(id, { ...input, candidate }, candidate, origin);
    if (!out.ok) return send(out);
    if (via) await noteJoined(c, deps, via, id, candidate.id);
    return json({ venue: out.value.venue, ownerToken: out.value.ownerToken, ownerUrl: ownerUrl(origin, id, out.value.ownerToken) }, 201);
  });
}

// The venue's Durable Object holds the nonce the token is signed with, so it checks the token itself.
function ownerOnly(deps: AppDeps) {
  return async (c: Ctx, next: () => Promise<void>): Promise<Response | void> => {
    const id = c.req.param("id") ?? "";
    if (!VENUE_ID_RE.test(id)) return apiError(404, "venue_not_found", "No venue with that id.");
    secretOf(c.env);
    const venue = deps.venue(c.env, id);
    if (!(await venue.ownerCheck(id, bearer(c.req.raw)))) {
      return apiError(401, "unauthorized", "This needs the owner link for this venue.");
    }
    c.set("venueId", id);
    c.set("venue", venue);
    await next();
  };
}

function nightId(c: Ctx): string | null {
  const id = c.req.param("nightId") ?? c.req.param("planId") ?? "";
  return NIGHT_ID_RE.test(id) ? id : null;
}

function nightRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.post("/api/venues/:id/nights/:planId/approve", async (c) => {
    const planId = nightId(c);
    if (!planId) return apiError(404, "plan_not_found", "No plan with that id.");
    const p = parse(ApproveSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    const input: ApproveInput = { actions: p.value.actions };
    if (p.value.partnerEmails) input.partnerEmails = p.value.partnerEmails;
    if (p.value.copy) input.copy = Object.fromEntries(Object.entries(p.value.copy).filter(([, v]) => v !== undefined));
    return send(await c.var.venue.approve(planId, input, originOf(c)));
  });

  app.post("/api/venues/:id/nights/:planId/invite", async (c) => {
    const planId = nightId(c);
    if (!planId) return apiError(404, "plan_not_found", "No plan with that id.");
    const p = parse(InviteSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    await limit(c, deps, "invite");
    return send(await c.var.venue.invite(planId, p.value.partnerId, originOf(c)));
  });

  app.post("/api/venues/:id/nights/:nightId/result", async (c) => {
    const id = nightId(c);
    if (!id) return apiError(404, "night_not_found", "No night with that id.");
    const p = parse(ResultSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    return send(await c.var.venue.result(id, p.value.headcount, p.value.note, p.value.capacity));
  });

  app.post("/api/venues/:id/nights/:nightId/unpublish", async (c) => {
    const id = nightId(c);
    return id ? send(await c.var.venue.unpublish(id)) : apiError(404, "night_not_found", "No night with that id.");
  });

  app.post("/api/venues/:id/nights/:nightId/republish", async (c) => {
    const id = nightId(c);
    return id ? send(await c.var.venue.republish(id)) : apiError(404, "night_not_found", "No night with that id.");
  });

  app.post("/api/venues/:id/nights/:nightId/edit", async (c) => {
    const id = nightId(c);
    if (!id) return apiError(404, "night_not_found", "No night with that id.");
    const p = parse(EditSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    return send(await c.var.venue.editNight(id, Object.fromEntries(Object.entries(p.value.copy).filter(([, v]) => v !== undefined))));
  });
}

function accountRoutes(app: Hono<AppEnv>): void {
  app.post("/api/venues/:id/owner-link", async (c) => send(await c.var.venue.newOwnerLink(originOf(c))));

  app.post("/api/venues/:id/settings", async (c) => {
    const p = parse(SettingsSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    return send(await c.var.venue.settings(cleanSettings(p.value)));
  });

  app.post("/api/venues/:id/email", async (c) => {
    const p = parse(EmailSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    return send(await c.var.venue.requestEmail(p.value.email, originOf(c)));
  });

  app.post("/api/venues/:id/email/confirm", async (c) => {
    const p = parse(ConfirmSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    return send(await c.var.venue.confirmEmail(p.value.code));
  });

  app.post("/api/venues/:id/eventbrite", async (c) => {
    const p = parse(EventbriteSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    return send(await c.var.venue.connectEventbrite(p.value.token));
  });
  app.delete("/api/venues/:id/eventbrite", async (c) => send(await c.var.venue.disconnectEventbrite()));
}

export function ownerRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  venueRoutes(app, deps);
  app.use("/api/venues/:id", ownerOnly(deps));
  app.use("/api/venues/:id/*", ownerOnly(deps));

  app.get("/api/venues/:id", async (c) => send(await c.var.venue.state()));
  app.delete("/api/venues/:id", async (c) => send(await c.var.venue.destroy()));
  app.post("/api/venues/:id/read", async (c) => {
    await limit(c, deps, "read");
    return send(await c.var.venue.read());
  });

  app.post("/api/venues/:id/plan", async (c) => {
    const p = parse(PlanInputSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    await limit(c, deps, "plan");
    return send(await c.var.venue.plan(cleanPlanInput(p.value)));
  });

  app.post("/api/venues/:id/refine", async (c) => {
    const p = parse(RefineSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    await limit(c, deps, "plan");
    return send(await c.var.venue.refine(p.value.planId, p.value.request));
  });

  // The match comes with the read; only a switch to a runner up asks Qloo again.
  app.post("/api/venues/:id/match", async (c) => {
    const p = parse(MatchSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    if (p.value.partnerId) await limit(c, deps, "match");
    return send(await c.var.venue.match(p.value.partnerId));
  });

  app.get("/api/venues/:id/invites", async (c) => send(await c.var.venue.invites()));
  app.get("/api/venues/:id/progress", async (c) => send(await c.var.venue.progress()));

  nightRoutes(app, deps);
  accountRoutes(app);

  app.post("/api/venues/:id/baseline", async (c) => {
    if (!c.env.AI) return apiError(503, "ai_unavailable", "The language model is not available here, so the plain model comparison cannot run.");
    await limit(c, deps, "baseline");
    return send(await c.var.venue.baseline());
  });
}
