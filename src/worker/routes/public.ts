import type { Hono } from "hono";
import { apiError, originAllowed, readCookie, setCookie } from "../http.ts";
import { renderEventPage, renderIcs, renderMissing, renderPoster, type PublicNight } from "../pages/event.ts";
import { FONT_PATH } from "../pages/style.ts";
import { venueIdFromSlug } from "../slug.ts";
import { randomId, sha256hex } from "../tokens.ts";
import { json, limit, pageResponse, type AppDeps, type AppEnv, type Ctx } from "./shared.ts";

const BROWSER_COOKIE = "fh_b";
const BROWSER_RE = /^[a-km-np-z2-9]{22}$/;
const YEAR_S = 60 * 60 * 24 * 365;

async function browserKey(c: Ctx, cookie: string): Promise<string> {
  return (await sha256hex(`${c.env.TOKEN_SECRET ?? "fullhouse"}|browser|${cookie}`)).slice(0, 24);
}

async function nightFor(c: Ctx, deps: AppDeps, slug: string, withBrowser: boolean): Promise<PublicNight | null> {
  const venueId = venueIdFromSlug(slug);
  if (!venueId) return null;
  const cookie = readCookie(c.req.raw, BROWSER_COOKIE);
  const browser = withBrowser && cookie && BROWSER_RE.test(cookie) ? await browserKey(c, cookie) : null;
  const out = await deps.venue(c.env, venueId).publicNight(slug, browser);
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
  const setC = setCookie(BROWSER_COOKIE, cookie, YEAR_S, "/e/", secure);
  if (!out.ok) {
    if (wantsJson) return apiError(out.status, out.error, out.detail);
    return out.status === 404 ? pageResponse(renderMissing(), 404) : c.redirect(`/e/${slug}`, 303);
  }
  if (wantsJson) return json(out.value, 200, { "set-cookie": setC });
  return new Response(null, { status: 303, headers: { location: `/e/${slug}#rsvp`, "set-cookie": setC, "cache-control": "no-store" } });
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
}
