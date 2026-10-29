import type { Hono } from "hono";
import { apiError } from "../http.ts";
import { VENUE_ID_RE } from "../ids.ts";
import { renderMissing } from "../pages/event.ts";
import { renderInvitePage } from "../pages/invite.ts";
import { venueIdFromInviteSlug } from "../slug.ts";
import { AnswerSchema, parse } from "../validate.ts";
import { fromEventPage } from "./public.ts";
import { json, limit, pageResponse, type AppDeps, type AppEnv, type Ctx } from "./shared.ts";

// The buttons on the page post a form; a script may post JSON. Both say only yes or no.
async function readAnswer(c: Ctx): Promise<"yes" | "no" | null> {
  const type = c.req.header("content-type") ?? "";
  let raw: unknown;
  try {
    if (/^application\/json\b/i.test(type)) raw = JSON.parse(await c.req.text());
    else if (/^application\/x-www-form-urlencoded\b/i.test(type)) raw = Object.fromEntries(new URLSearchParams(await c.req.text()));
    else return null;
  } catch {
    return null;
  }
  const p = parse(AnswerSchema, raw);
  return p.ok ? p.value.answer : null;
}

async function answer(c: Ctx, deps: AppDeps): Promise<Response> {
  const slug = c.req.param("slug") ?? "";
  const wantsJson = (c.req.header("accept") ?? "").includes("application/json");
  if (!fromEventPage(c, wantsJson)) return apiError(403, "origin_not_allowed", "Answer from the invite page itself.");
  const venueId = venueIdFromInviteSlug(slug);
  if (!venueId) return wantsJson ? apiError(404, "invite_not_found") : pageResponse(renderMissing(), 404);
  await limit(c, deps, "invite_answer");
  await limit(c, deps, "rsvp_night", `invite:${slug}`);
  const said = await readAnswer(c);
  if (!said) return wantsJson ? apiError(400, "invalid_input", "answer: say yes or no") : c.redirect(`/i/${slug}`, 303);
  const out = await deps.venue(c.env, venueId).answerInvite(slug, said);
  if (wantsJson) return out.ok ? json({ status: out.value.status, answeredAt: out.value.answeredAt }) : apiError(out.status, out.error, out.detail);
  if (!out.ok && out.status === 404) return pageResponse(renderMissing(), 404);
  return new Response(null, { status: 303, headers: { location: `/i/${slug}#answer`, "cache-control": "no-store" } });
}

export function inviteRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.get("/i/:slug", async (c) => {
    const slug = c.req.param("slug");
    const venueId = venueIdFromInviteSlug(slug);
    if (!venueId) return pageResponse(renderMissing(), 404);
    const out = await deps.venue(c.env, venueId).publicInvite(slug);
    if (!out.ok) return pageResponse(renderMissing(), 404);
    return pageResponse(renderInvitePage(out.value, new URL(c.req.url).origin));
  });

  app.post("/i/:slug/answer", (c) => answer(c, deps));
}

// The landing's example comes from one venue the server names; without it the landing shows none.
export function exampleRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.get("/api/example", async (c) => {
    const id = c.env.EXAMPLE_VENUE?.trim() ?? "";
    if (!VENUE_ID_RE.test(id)) return apiError(404, "no_example", "No example is set on this server.");
    const out = await deps.venue(c.env, id).example();
    if (!out.ok) return apiError(404, "no_example", "The example venue has no joint night yet.");
    return json(out.value);
  });
}
