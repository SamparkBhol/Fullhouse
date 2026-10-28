import { describe, expect, it } from "vitest";
import type { StatsBody, VenueDashboard } from "../../../src/shared/stats.ts";
import { StatsBuffer } from "../../../src/worker/stats/buffer.ts";
import { settleVenueStats } from "../../../src/worker/stats/venue_history.ts";
import { clock, statsCore } from "../stats/sqlite.ts";
import { createVenue, ORIGIN, published, req, testApp } from "../test_app.ts";

const NOW = "2026-10-25T10:00:00.000Z";

function withStats() {
  const c = clock(NOW);
  const { core, sql } = statsCore(c.now);
  const sink = new StatsBuffer(c.now);
  const h = testApp({ stats: core, deps: { stats: sink } });
  // Stands in for the Durable Object wrapper that sends a request's events at its end.
  const settle = async (venueId?: string) => {
    const store = venueId ? h.stores.get(venueId) : undefined;
    if (store) await settleVenueStats(sink, store, core);
    else await core.record(sink.take());
  };
  return { h, core, sink, settle, sql };
}

describe("GET /api/stats", () => {
  it("answers the aggregates, series, endpoints, budget and log for a range", async () => {
    const { h, settle } = withStats();
    await createVenue(h);
    await settle();
    const res = await req(h, "/api/stats?range=7d");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("etag")).toMatch(/^"[0-9a-f]{24}"$/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const body = (await res.json()) as StatsBody;
    expect(body.range).toBe("7d");
    expect(body.buckets).toHaveLength(28);
    expect(Object.keys(body.series).sort()).toEqual(["nightsPublished", "qlooCacheHits", "qlooCalls", "qlooErrors", "rsvps", "streetReads", "venues"]);
    expect(body.series.venues).toHaveLength(28);
    expect(body.totals.venues).toBe(1);
    expect(body.budget).toMatchObject({ budget: 4000, newVenueShare: 0.8 });
    expect(body.events[0]).toEqual({ at: NOW, kind: "venue_created", line: "A venue was set up." });
    for (const secret of ["owner@example.com", "Berlin", "Blue Hour Records", "venueId"]) expect(JSON.stringify(body)).not.toContain(secret);
  });

  it("defaults to 24 hours and refuses other ranges", async () => {
    const { h } = withStats();
    expect(((await (await req(h, "/api/stats")).json()) as StatsBody).range).toBe("24h");
    const bad = await req(h, "/api/stats?range=1y");
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: "invalid_range" });
  });

  it("answers 304 with no body when the ETag still matches", async () => {
    const { h } = withStats();
    const first = await req(h, "/api/stats?range=24h");
    const etag = first.headers.get("etag") ?? "";
    const again = await req(h, "/api/stats?range=24h", { headers: { "if-none-match": etag } });
    expect(again.status).toBe(304);
    expect(again.headers.get("etag")).toBe(etag);
    expect(await again.text()).toBe("");
    const other = await req(h, "/api/stats?range=24h", { headers: { "if-none-match": '"stale"' } });
    expect(other.status).toBe(200);
  });

  it("limits one address to 30 requests a minute", async () => {
    const { h } = withStats();
    for (let i = 0; i < 30; i++) expect((await req(h, "/api/stats")).status).toBe(200);
    const res = await req(h, "/api/stats");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await req(h, "/api/stats", { headers: { "cf-connecting-ip": "198.51.100.9" } })).status).toBe(200);
  });

  it("says plainly when the server keeps no stats", async () => {
    const res = await req(testApp(), "/api/stats");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "stats_off" });
  });

  it("counts an MCP tool call only when the tool did its job", async () => {
    const { core } = statsCore(() => new Date());
    const h = testApp({ stats: core });
    const headers = { accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25", origin: ORIGIN };
    const call = (name: string, args: Record<string, unknown>) => req(h, "/mcp", { method: "POST", headers, body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } });
    await call("find_venue", { name: "Blue Hour Records", city: "Berlin" });
    await call("publish_night", { venue_id: "a".repeat(22), owner_token: "x".repeat(40), plan_id: "b".repeat(22) });
    await call("drop table", {});
    const body = (await (await req(h, "/api/stats")).json()) as StatsBody;
    expect(body.totals.mcpCalls).toBe(1);
    expect(body.mcpTools).toEqual([{ tool: "find_venue", n: 1 }]);
    expect(body.events.map((e) => e.line)).toEqual(["An MCP client called find_venue."]);
  });

  it("turns a tight loop on /mcp away before it reaches a Durable Object", async () => {
    const h = testApp();
    const headers = { accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25", origin: ORIGIN };
    const ping = () => req(h, "/mcp", { method: "POST", headers, body: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
    for (let i = 0; i < 60; i++) expect((await ping()).status).toBe(200);
    const refused = await ping();
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("GET /live.txt", () => {
  it("serves the same numbers as plain text", async () => {
    const { h, settle } = withStats();
    await createVenue(h);
    await settle();
    const res = await req(h, "/live.txt?range=30d");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const text = await res.text();
    expect(text).toContain("Full House, live numbers");
    expect(text).toContain("Counts for the last 30 days.");
    expect(text).toMatch(/Venues set up\s+1 {3}1 since counting began/);
    expect(text).toMatch(/Street reads\s+0 {3}0 since counting began/);
    expect(text).toContain("Nights with a turnout logged");
    expect(text).toContain("Head counts and seats show once 5 nights are logged in a range");
    expect(text).toContain("This answer is at most 300 seconds old.");
    expect(text).toContain("A venue was set up.");
    expect(text).not.toContain("Blue Hour Records");
    expect(text).not.toMatch(/[\u2013\u2014]| - /);
    const etag = res.headers.get("etag") ?? "";
    expect((await req(h, "/live.txt?range=30d", { headers: { "if-none-match": etag } })).status).toBe(304);
  });
});

describe("GET /api/venues/:id/dashboard", () => {
  it("is for the owner only", async () => {
    const { h } = withStats();
    const v = await createVenue(h);
    expect((await req(h, `/api/venues/${v.id}/dashboard`)).status).toBe(401);
    expect((await req(h, `/api/venues/${v.id}/dashboard`, { token: "x".repeat(40) })).status).toBe(401);
  });

  it("returns nights, reads, Monday runs and the live RSVP count of the next night", async () => {
    const { h, settle } = withStats();
    const p = await published(h);
    const venue = h.venues.get(p.id)!;
    await settle(p.id);
    await venue.rsvp(p.night.eventSlug!, "browser-one");
    await venue.monday();
    await settle(p.id);
    const res = await req(h, `/api/venues/${p.id}/dashboard`, { token: p.token });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    const d = (await res.json()) as VenueDashboard;
    expect(d.venueId).toBe(p.id);
    expect(d.nights).toHaveLength(1);
    expect(d.nights[0]).toMatchObject({ id: p.night.id, rsvps: 1, room: 40, public: true, withdrawn: false, status: "approved" });
    expect(d.next).toMatchObject({ nightId: p.night.id, rsvps: 1, room: 40 });
    expect(d.reads.length).toBeGreaterThanOrEqual(1);
    expect(d.reads[0]).toMatchObject({ calls: 0, cached: 0 });
    expect(d.mondays).toHaveLength(1);
    expect(d.mondays[0]).toMatchObject({ planned: true, proposal: { format: "listening", published: false } });
    const etag = res.headers.get("etag") ?? "";
    expect((await req(h, `/api/venues/${p.id}/dashboard`, { token: p.token, headers: { "if-none-match": etag } })).status).toBe(304);
    await venue.rsvp(p.night.eventSlug!, "browser-two");
    const changed = await req(h, `/api/venues/${p.id}/dashboard`, { token: p.token, headers: { "if-none-match": etag } });
    expect(changed.status).toBe(200);
    expect(((await changed.json()) as VenueDashboard).next?.rsvps).toBe(2);
  });

  it("counts turnout once, keeps the head count private under five nights, and logs it without the venue or the number", async () => {
    const { h, core, settle, sql } = withStats();
    const p = await published(h);
    await settle(p.id);
    await req(h, `/api/venues/${p.id}/nights/${p.night.id}/result`, { method: "POST", token: p.token, body: { headcount: 21 } });
    await req(h, `/api/venues/${p.id}/nights/${p.night.id}/result`, { method: "POST", token: p.token, body: { headcount: 24 } });
    await settle(p.id);
    const body = await core.stats("24h");
    expect(body.totals).toMatchObject({ turnoutNights: 1, turnoutPeople: null, roomSeats: null, roomPeople: null, nightsPublished: 1, plans: 1 });
    const kept = Object.fromEntries(sql.exec("SELECT metric, SUM(n) AS n FROM stats_day GROUP BY metric").toArray().map((r) => [String(r["metric"]), Number(r["n"])]));
    expect(kept).toMatchObject({ turnout_nights: 1, turnout_people: 24, room_seats: 40, room_people: 24 });
    const turnoutLines = body.events.filter((e) => e.kind === "turnout").map((e) => e.line);
    expect(turnoutLines).toEqual(["A venue corrected the turnout of a night.", "A venue logged the turnout of a night."]);
  });

  it("drops the venue's lines from the public log when the owner takes the night down or deletes the venue", async () => {
    const { h, core, settle } = withStats();
    const p = await published(h);
    await settle(p.id);
    expect((await core.stats("24h")).events.some((e) => e.kind === "night_published")).toBe(true);
    await req(h, `/api/venues/${p.id}/nights/${p.night.id}/unpublish`, { method: "POST", token: p.token, body: {} });
    await settle(p.id);
    const down = await core.stats("24h");
    expect(down.events.some((e) => e.kind === "night_published")).toBe(false);
    expect(down.totals.nightsPublished).toBe(1);
    await req(h, `/api/venues/${p.id}`, { method: "DELETE", token: p.token });
    await settle(p.id);
    expect((await core.stats("24h")).events).toEqual([]);
  });
});
