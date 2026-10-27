import { describe, expect, it } from "vitest";
import type { Night, PlanResponse, StreetRead, VenueState } from "../../src/shared/contract.ts";
import { ownerToken } from "../../src/worker/tokens.ts";
import { CANDIDATE, CREATE_BODY, createVenue, harness, ORIGIN, PARTNERS, req } from "./helpers.ts";

async function planned(h: ReturnType<typeof harness>) {
  const v = await createVenue(h);
  const res = await req(h, `/api/venues/${v.id}/plan`, { method: "POST", token: v.token, body: { maxPeople: 30 } });
  expect(res.status).toBe(200);
  return { ...v, plan: (await res.json()) as PlanResponse };
}

async function published(h: ReturnType<typeof harness>, actions = ["event_page", "poster", "ics", "outreach"]) {
  const p = await planned(h);
  const res = await req(h, `/api/venues/${p.id}/nights/${p.plan.plan.id}/approve`, {
    method: "POST",
    token: p.token,
    body: { actions, partnerEmails: { [PARTNERS[0]!.id]: "hi@kanal.example" } },
  });
  expect(res.status).toBe(200);
  return { ...p, night: (await res.json()) as Night };
}

describe("health and headers", () => {
  it("reports what is configured without leaking secrets", async () => {
    const h = harness();
    const res = await req(h, "/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: true, qloo: true, ai: false, tokens: true });
    expect(JSON.stringify(body)).not.toContain("test-qloo-key");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("answers CORS only for its own origin", async () => {
    const h = harness();
    const own = await req(h, "/api/health", { method: "OPTIONS", headers: { origin: ORIGIN, "access-control-request-method": "POST" } });
    expect(own.status).toBe(204);
    expect(own.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const other = await req(h, "/api/health", { method: "OPTIONS", headers: { origin: "https://evil.example" } });
    expect(other.status).toBe(403);
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
    const get = await req(h, "/api/health", { headers: { origin: "https://evil.example" } });
    expect(get.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("refuses writes from another origin", async () => {
    const h = harness();
    const res = await req(h, "/api/venues/search", { method: "POST", body: { name: "x", city: "y" }, headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
    expect(h.searches).toHaveLength(0);
  });

  it("caps bodies at 64 KB", async () => {
    const h = harness();
    const res = await req(h, "/api/venues/search", { method: "POST", body: { name: "x".repeat(70 * 1024), city: "y" } });
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toBe("body_too_large");
  });

  it("wants JSON bodies", async () => {
    const h = harness();
    const res = await req(h, "/api/venues/search", { method: "POST", body: "name=x", headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect(res.status).toBe(415);
  });

  it("returns ApiError JSON for unknown API routes", async () => {
    const h = harness();
    const res = await req(h, "/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not_found" });
  });
});

describe("venue search and creation", () => {
  it("says plainly when the Qloo key is missing and returns no data", async () => {
    const h = harness({ env: { QLOO_API_KEY: "" } });
    const res = await req(h, "/api/venues/search", { method: "POST", body: { name: "Blue Hour", city: "Berlin" } });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "qloo_key_missing" });
    expect(h.searches).toHaveLength(0);
  });

  it("returns candidates and wires Qloo with the secret, the default host and the meter budget", async () => {
    const h = harness();
    const res = await req(h, "/api/venues/search", { method: "POST", body: { name: "Blue Hour", city: "Berlin" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([CANDIDATE]);
    expect(h.qlooOptions[0]?.apiKey).toBe("test-qloo-key");
    expect(h.qlooOptions[0]?.baseUrl).toBeUndefined();
    expect(typeof h.qlooOptions[0]?.budget).toBe("function");
  });

  it("passes QLOO_BASE_URL only when it is set", async () => {
    const h = harness({ env: { QLOO_BASE_URL: "http://127.0.0.1:8788" } });
    await req(h, "/api/venues/search", { method: "POST", body: { name: "Blue Hour", city: "Berlin" } });
    expect(h.qlooOptions[0]?.baseUrl).toBe("http://127.0.0.1:8788");
  });

  it("rate limits searches per address", async () => {
    const h = harness();
    for (let i = 0; i < 120; i++) await req(h, "/api/venues/search", { method: "POST", body: { name: "a", city: "b" } });
    const res = await req(h, "/api/venues/search", { method: "POST", body: { name: "a", city: "b" } });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    const other = await req(h, "/api/venues/search", { method: "POST", body: { name: "a", city: "b" }, headers: { "cf-connecting-ip": "198.51.100.1" } });
    expect(other.status).toBe(200);
  });

  it("creates a venue from the candidate Qloo returns again, with an owner link", async () => {
    const h = harness();
    const v = await createVenue(h);
    expect(v.ownerUrl).toBe(`${ORIGIN}/v/${v.id}#t=${v.token}`);
    expect(v.token).toBe(await ownerToken(h.deps.secret, v.id));
    expect(h.searches.at(-1)).toEqual({ name: CANDIDATE.name, city: "Berlin" });
    const state = (await (await req(h, `/api/venues/${v.id}`, { token: v.token })).json()) as VenueState;
    expect(state.venue.entity).toEqual(CANDIDATE);
    expect(state.nextAlarm).toBeTruthy();
  });

  it("refuses a candidate that Qloo does not return", async () => {
    const h = harness();
    const res = await req(h, "/api/venues", { method: "POST", body: { ...CREATE_BODY, candidate: { id: "MADE-UP", name: "Fake" } } });
    expect(res.status).toBe(409);
    expect(h.venues.size).toBe(0);
  });

  it("validates the time zone, slot and email", async () => {
    const h = harness();
    for (const bad of [
      { ...CREATE_BODY, tz: "Mars/Olympus" },
      { ...CREATE_BODY, quietSlot: { weekday: 9, start: "19:00", durationMin: 180 } },
      { ...CREATE_BODY, quietSlot: { weekday: 4, start: "7pm", durationMin: 180 } },
      { ...CREATE_BODY, ownerEmail: "nope" },
    ]) {
      const res = await req(h, "/api/venues", { method: "POST", body: bad });
      expect(res.status).toBe(400);
    }
  });

  it("needs TOKEN_SECRET to issue owner links", async () => {
    const h = harness({ env: { TOKEN_SECRET: "" } });
    const res = await req(h, "/api/venues", { method: "POST", body: CREATE_BODY });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "token_secret_missing" });
  });
});

describe("owner routes", () => {
  it("need the right bearer token", async () => {
    const h = harness();
    const v = await createVenue(h);
    expect((await req(h, `/api/venues/${v.id}`)).status).toBe(401);
    expect((await req(h, `/api/venues/${v.id}`, { token: "wrong" })).status).toBe(401);
    const other = await createVenue(h);
    expect((await req(h, `/api/venues/${v.id}`, { token: other.token })).status).toBe(401);
    expect((await req(h, `/api/venues/${v.id}`, { token: v.token })).status).toBe(200);
    expect((await req(h, `/api/venues/not-a-venue-id`, { token: v.token })).status).toBe(404);
  });

  it("read the street and plan a night with two alternatives and stored input", async () => {
    const h = harness();
    const v = await createVenue(h);
    const read = await req(h, `/api/venues/${v.id}/read`, { method: "POST", token: v.token, body: {} });
    expect(read.status).toBe(200);
    expect(((await read.json()) as StreetRead).venueId).toBe(v.id);
    const res = await req(h, `/api/venues/${v.id}/plan`, { method: "POST", token: v.token, body: { maxPeople: 30, preferFormats: ["film"] } });
    const plan = (await res.json()) as PlanResponse;
    expect(plan.alternatives).toHaveLength(2);
    expect(plan.input).toEqual({ maxPeople: 30, preferFormats: ["film"] });
    expect(plan.plan.copy.writtenBy).toBe("template");
  });

  it("returns qloo_key_missing for a read without the key", async () => {
    const h = harness();
    const v = await createVenue(h);
    h.env.QLOO_API_KEY = "";
    h.deps.qloo = () => null;
    const res = await req(h, `/api/venues/${v.id}/read`, { method: "POST", token: v.token, body: {} });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "qloo_key_missing" });
  });

  it("refine maps a plain request onto the stored input", async () => {
    const h = harness();
    const p = await planned(h);
    const res = await req(h, `/api/venues/${p.id}/refine`, { method: "POST", token: p.token, body: { planId: p.plan.plan.id, request: "make it Friday, no live music" } });
    expect(res.status).toBe(200);
    const out = (await res.json()) as PlanResponse;
    expect(out.refine?.method).toBe("keywords");
    expect(out.input).toMatchObject({ maxPeople: 30, weekday: 5, noLiveMusic: true });
    expect(out.plan.origin).toBe("refine");
  });

  it("approve runs the chosen actions once and returns the same night on a retry", async () => {
    const h = harness();
    const p = await published(h);
    expect(p.night.status).toBe("approved");
    expect(p.night.eventSlug).toMatch(new RegExp(`-${p.id}-[a-km-np-z2-9]{5}$`));
    expect(p.night.actions.map((a) => a.kind)).toEqual(["event_page", "poster", "ics", "outreach", "outreach"]);
    const again = await req(h, `/api/venues/${p.id}/nights/${p.plan.plan.id}/approve`, { method: "POST", token: p.token, body: { actions: ["event_page"] } });
    expect(((await again.json()) as Night).eventSlug).toBe(p.night.eventSlug);
    const state = (await (await req(h, `/api/venues/${p.id}`, { token: p.token })).json()) as VenueState;
    expect(state.nights).toHaveLength(1);
    expect(state.proposals.map((x) => x.id)).not.toContain(p.plan.plan.id);
  });

  it("rejects unknown actions", async () => {
    const h = harness();
    const p = await planned(h);
    const res = await req(h, `/api/venues/${p.id}/nights/${p.plan.plan.id}/approve`, { method: "POST", token: p.token, body: { actions: ["tweet"] } });
    expect(res.status).toBe(400);
  });

  it("logs turnout and keeps it off the public page", async () => {
    const h = harness();
    const p = await published(h);
    const res = await req(h, `/api/venues/${p.id}/nights/${p.night.id}/result`, { method: "POST", token: p.token, body: { headcount: 4319, note: "Good crowd" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ headcount: 4319, status: "done", resultNote: "Good crowd" });
    const page = await (await req(h, `/e/${p.night.eventSlug}`)).text();
    expect(page).not.toContain("4319");
    expect(page).not.toContain("Good crowd");
  });

  it("stores the Eventbrite token encrypted and never returns it", async () => {
    const calls: string[] = [];
    const h = harness({
      deps: {
        fetch: (async (url: RequestInfo | URL) => {
          calls.push(String(url));
          return new Response(JSON.stringify({ organizations: [{ id: "42", name: "Blue Hour Org" }] }), { status: 200 });
        }) as typeof fetch,
      },
    });
    const v = await createVenue(h);
    const res = await req(h, `/api/venues/${v.id}/eventbrite`, { method: "POST", token: v.token, body: { token: "EBPRIVATETOKEN42" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ organization: "Blue Hour Org" });
    const raw = JSON.stringify([...h.stores.get(v.id)!.data.entries()]);
    expect(raw).not.toContain("EBPRIVATETOKEN42");
    const state = await (await req(h, `/api/venues/${v.id}`, { token: v.token })).text();
    expect(state).not.toContain("EBPRIVATETOKEN42");
    expect(state).toContain("Blue Hour Org");
    expect(calls).toEqual(["https://www.eventbriteapi.com/v3/users/me/organizations/"]);
    const off = await req(h, `/api/venues/${v.id}/eventbrite`, { method: "DELETE", token: v.token });
    expect(off.status).toBe(200);
    expect(JSON.stringify([...h.stores.get(v.id)!.data.entries()])).not.toContain("sealed");
  });

  it("baseline needs the AI binding", async () => {
    const h = harness();
    const p = await planned(h);
    const res = await req(h, `/api/venues/${p.id}/baseline`, { method: "POST", token: p.token, body: {} });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "ai_unavailable" });
  });

  it("baseline runs and is kept for the proof tab when AI is present", async () => {
    const ai = { run: async () => ({ response: "x" }) };
    const h = harness({ ai, deps: { generate: async () => "x" } });
    const p = await planned(h);
    const res = await req(h, `/api/venues/${p.id}/baseline`, { method: "POST", token: p.token, body: {} });
    expect(res.status).toBe(200);
    const state = (await (await req(h, `/api/venues/${p.id}`, { token: p.token })).json()) as VenueState;
    expect(state.baseline?.method).toBe("fake");
  });

  it("delete removes everything and the public page goes away", async () => {
    const h = harness();
    const p = await published(h);
    expect((await req(h, `/api/venues/${p.id}`, { method: "DELETE", token: p.token })).status).toBe(200);
    expect(h.stores.get(p.id)!.data.size).toBe(0);
    expect(h.stores.get(p.id)!.alarm).toBeNull();
    expect((await req(h, `/e/${p.night.eventSlug}`)).status).toBe(404);
  });
});

describe("public pages", () => {
  it("serve the event page with strict headers and a hashed stylesheet", async () => {
    const h = harness();
    const p = await published(h);
    const res = await req(h, `/e/${p.night.eventSlug}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/style-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("tile.openstreetmap.org");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    const html = await res.text();
    expect(html).toContain("Jazz on vinyl night");
    expect(html).toContain("0 going");
  });

  it("count one RSVP per browser and redirect back to the page", async () => {
    const h = harness();
    const p = await published(h);
    const first = await req(h, `/e/${p.night.eventSlug}/rsvp`, { method: "POST", headers: { origin: ORIGIN } });
    expect(first.status).toBe(303);
    expect(first.headers.get("location")).toBe(`/e/${p.night.eventSlug}#rsvp`);
    const cookie = (first.headers.get("set-cookie") ?? "").split(";")[0]!;
    expect(first.headers.get("set-cookie")).toContain("HttpOnly");
    expect(first.headers.get("set-cookie")).toContain("Secure");
    const again = await req(h, `/e/${p.night.eventSlug}/rsvp`, { method: "POST", headers: { origin: ORIGIN, cookie, accept: "application/json" } });
    expect(await again.json()).toEqual({ count: 1, already: true });
    const otherBrowser = await req(h, `/e/${p.night.eventSlug}/rsvp`, { method: "POST", headers: { accept: "application/json" } });
    expect(await otherBrowser.json()).toEqual({ count: 2, already: false });
    const page = await (await req(h, `/e/${p.night.eventSlug}`, { headers: { cookie } })).text();
    expect(page).toContain("2 going");
    expect(page).toContain("You are on the list");
  });

  it("refuse cross site RSVPs", async () => {
    const h = harness();
    const p = await published(h);
    expect((await req(h, `/e/${p.night.eventSlug}/rsvp`, { method: "POST", headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect((await req(h, `/e/${p.night.eventSlug}/rsvp`, { method: "POST", headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
  });

  it("serve the calendar file and the printable poster", async () => {
    const h = harness();
    const p = await published(h);
    const ics = await req(h, `/e/${p.night.eventSlug}.ics`);
    expect(ics.status).toBe(200);
    expect(ics.headers.get("content-type")).toContain("text/calendar");
    expect(await ics.text()).toContain("DTSTART:20261105T180000Z");
    const poster = await req(h, `/e/${p.night.eventSlug}/poster`);
    expect(poster.status).toBe(200);
    expect(poster.headers.get("content-security-policy")).toMatch(/script-src 'sha256-/);
    const html = await poster.text();
    expect(html).toContain("<svg");
    expect(html).toContain("@page{size:A4");
  });

  it("only publish what the owner approved", async () => {
    const h = harness();
    const p = await published(h, ["ics"]);
    expect((await req(h, `/e/${p.night.eventSlug}`)).status).toBe(404);
    expect((await req(h, `/e/${p.night.eventSlug}/poster`)).status).toBe(404);
    expect((await req(h, `/e/${p.night.eventSlug}.ics`)).status).toBe(200);
    expect((await req(h, `/e/${p.night.eventSlug}/rsvp`, { method: "POST", headers: { accept: "application/json" } })).status).toBe(404);
  });

  it("404 unknown or malformed slugs without touching a venue", async () => {
    const h = harness();
    expect((await req(h, "/e/<script>")).status).toBe(404);
    expect((await req(h, "/e/jazz-abcdefghijkm-abcde")).status).toBe(404);
  });
});

describe("MCP endpoint", () => {
  const headers = { accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25", origin: ORIGIN };
  const rpc = (method: string, params: Record<string, unknown> = {}, id = 1) => ({ jsonrpc: "2.0", id, method, params });

  it("initializes on protocol 2025-11-25 with a JSON response", async () => {
    const h = harness();
    const res = await req(h, "/mcp", {
      method: "POST",
      headers: { accept: "application/json, text/event-stream", origin: ORIGIN },
      body: rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { result: { protocolVersion: string; serverInfo: { name: string } } };
    expect(body.result.protocolVersion).toBe("2025-11-25");
    expect(body.result.serverInfo.name).toBe("fullhouse");
  });

  it("lists the five tools with input schemas", async () => {
    const h = harness();
    const res = await req(h, "/mcp", { method: "POST", headers, body: rpc("tools/list") });
    const body = (await res.json()) as { result: { tools: Array<{ name: string; inputSchema: { properties: Record<string, unknown> } }> } };
    expect(body.result.tools.map((t) => t.name).sort()).toEqual(["find_venue", "log_turnout", "propose_night", "publish_night", "read_street"]);
    const publish = body.result.tools.find((t) => t.name === "publish_night")!;
    expect(Object.keys(publish.inputSchema.properties)).toEqual(expect.arrayContaining(["venue_id", "owner_token", "plan_id", "actions"]));
  });

  it("finds venues with structured content", async () => {
    const h = harness();
    const res = await req(h, "/mcp", { method: "POST", headers, body: rpc("tools/call", { name: "find_venue", arguments: { name: "Blue Hour", city: "Berlin" } }) });
    const body = (await res.json()) as { result: { structuredContent: { candidates: unknown[] }; isError?: boolean } };
    expect(body.result.isError).toBeFalsy();
    expect(body.result.structuredContent.candidates).toEqual([CANDIDATE]);
  });

  it("refuses owner tools without the owner token", async () => {
    const h = harness();
    const v = await createVenue(h);
    const res = await req(h, "/mcp", {
      method: "POST",
      headers,
      body: rpc("tools/call", { name: "propose_night", arguments: { venue_id: v.id, owner_token: "x".repeat(20) } }),
    });
    const body = (await res.json()) as { result: { isError: boolean; content: Array<{ text: string }> } };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0]?.text).toContain("do not match");
  });

  it("proposes, publishes and logs turnout for the owner", async () => {
    const h = harness();
    const v = await createVenue(h);
    const auth = { venue_id: v.id, owner_token: v.token };
    const proposed = (await (
      await req(h, "/mcp", { method: "POST", headers, body: rpc("tools/call", { name: "propose_night", arguments: { ...auth, max_people: 25 } }) })
    ).json()) as { result: { structuredContent: PlanResponse } };
    const planId = proposed.result.structuredContent.plan.id;
    const pub = (await (
      await req(h, "/mcp", { method: "POST", headers, body: rpc("tools/call", { name: "publish_night", arguments: { ...auth, plan_id: planId, actions: ["event_page", "ics"] } }) })
    ).json()) as { result: { structuredContent: { night: Night } } };
    expect(pub.result.structuredContent.night.actions.map((a) => a.kind)).toEqual(["event_page", "ics"]);
    const logged = (await (
      await req(h, "/mcp", { method: "POST", headers, body: rpc("tools/call", { name: "log_turnout", arguments: { ...auth, night_id: planId, headcount: 12 } }) })
    ).json()) as { result: { structuredContent: { night: Night } } };
    expect(logged.result.structuredContent.night.headcount).toBe(12);
  });

  it("rejects GET and DELETE because it is stateless", async () => {
    const h = harness();
    expect((await req(h, "/mcp")).status).toBe(405);
    expect((await req(h, "/mcp", { method: "DELETE" })).status).toBe(405);
  });
});
