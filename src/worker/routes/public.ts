import type { Hono } from "hono";
import { apiError, ipKey, originAllowed, readCookie, setCookie } from "../http.ts";
import { tokenSecretOf } from "../env.ts";
import { renderEventPage, renderIcs, renderMissing, renderPoster, renderReported, type PublicNight } from "../pages/event.ts";
import { FONT_PATH } from "../pages/style.ts";
import { venueIdFromSlug } from "../slug.ts";
import { sha256hex } from "../crypto.ts";
import { randomId } from "../ids.ts";
import { json, limit, pageResponse, type AppDeps, type AppEnv, type Ctx } from "./shared.ts";

const BROWSER_COOKIE = "fh_b";
const BROWSER_RE = /^[a-km-np-z2-9]{22}$/;
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 90;

// The slug is in the hash, so the same browser leaves a different value in every venue it says yes to.
async function browserKey(c: Ctx, slug: string, cookie: string): Promise<string> {
  return (await sha256hex(`${tokenSecretOf(c.env) || "fullhouse"}|browser|${slug}|${cookie}`)).slice(0, 24);
}

// Public posts come from the event page itself: a cross site post is refused, and a JSON post must say where it came from.
export function fromEventPage(c: Ctx, wantsJson: boolean): boolean {
  const site = c.req.header("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  if (wantsJson && !c.req.header("origin")) return false;
  return originAllowed(c.req.raw, c.env);
}

// Only a short slug of a place's name is ever read from the link.
function viaOf(c: Ctx): string | undefined {
  const v = c.req.query("via");
  return v && /^[a-z0-9-]{1,60}$/.test(v) ? v : undefined;
}

async function nightFor(c: Ctx, deps: AppDeps, slug: string, withBrowser: boolean): Promise<PublicNight | null> {
  const venueId = venueIdFromSlug(slug);
  if (!venueId) return null;
  const cookie = readCookie(c.req.raw, BROWSER_COOKIE);
  const browser = withBrowser && cookie && BROWSER_RE.test(cookie) ? await browserKey(c, slug, cookie) : null;
  const out = await deps.venue(c.env, venueId).publicNight(slug, browser, viaOf(c));
  return out.ok ? out.value : null;
}

async function calendarFile(c: Ctx, deps: AppDeps, slug: string): Promise<Response> {
  const n = await nightFor(c, deps, slug, false);
  if (!n || !n.published.ics) return pageResponse(renderMissing(), 404);
  return new Response(renderIcs(n, new URL(c.req.url).origin, new Date()), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${slug.slice(0, 60)}.ics"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

// One RSVP per browser: a random cookie, stored only as a salted hash next to the count.
async function rsvp(c: Ctx, deps: AppDeps): Promise<Response> {
  const slug = c.req.param("slug") ?? "";
  const wantsJson = (c.req.header("accept") ?? "").includes("application/json");
  if (!fromEventPage(c, wantsJson)) return apiError(403, "origin_not_allowed", "Say you are coming from the event page itself.");
  const venueId = venueIdFromSlug(slug);
  if (!venueId) return wantsJson ? apiError(404, "night_not_found") : pageResponse(renderMissing(), 404);
  await limit(c, deps, "rsvp");
  await limit(c, deps, "rsvp_night", slug);
  const existing = readCookie(c.req.raw, BROWSER_COOKIE);
  const cookie = existing && BROWSER_RE.test(existing) ? existing : randomId(22);
  const out = await deps.venue(c.env, venueId).rsvp(slug, await browserKey(c, slug, cookie), viaOf(c));
  const secure = new URL(c.req.url).protocol === "https:";
  const setC = setCookie(BROWSER_COOKIE, cookie, COOKIE_MAX_AGE_S, "/e/", secure);
  if (!out.ok) {
    if (wantsJson) return apiError(out.status, out.error, out.detail);
    return out.status === 404 ? pageResponse(renderMissing(), 404) : c.redirect(`/e/${slug}`, 303);
  }
  if (wantsJson) return json(out.value, 200, { "set-cookie": setC });
  return new Response(null, { status: 303, headers: { location: `/e/${slug}#rsvp`, "set-cookie": setC, "cache-control": "no-store" } });
}

async function report(c: Ctx, deps: AppDeps): Promise<Response> {
  const slug = c.req.param("slug") ?? "";
  if (!fromEventPage(c, false)) return apiError(403, "origin_not_allowed", "Report the page from the page itself.");
  const venueId = venueIdFromSlug(slug);
  if (!venueId) return pageResponse(renderMissing(), 404);
  await limit(c, deps, "report");
  const reporter = (await ipKey(c.req.raw, tokenSecretOf(c.env) || "fullhouse")).slice(0, 24);
  const out = await deps.venue(c.env, venueId).report(slug, reporter);
  if (!out.ok) return pageResponse(renderMissing(), 404);
  return pageResponse(renderReported(out.value.hidden));
}

export function publicRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
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

  app.get("/e/:slug", async (c) => {
    const raw = c.req.param("slug");
    if (raw.endsWith(".ics")) return calendarFile(c, deps, raw.slice(0, -4));
    const n = await nightFor(c, deps, raw, true);
    if (!n || !n.published.page) return pageResponse(renderMissing(), 404);
    return pageResponse(renderEventPage(n, new URL(c.req.url).origin, new Date()));
  });

  app.get("/e/:slug/poster", async (c) => {
    const n = await nightFor(c, deps, c.req.param("slug"), false);
    if (!n || !n.published.poster) return pageResponse(renderMissing(), 404);
    return pageResponse(renderPoster(n, new URL(c.req.url).origin), 200, true);
  });

  app.post("/e/:slug/rsvp", (c) => rsvp(c, deps));
  app.post("/e/:slug/report", (c) => report(c, deps));
}
