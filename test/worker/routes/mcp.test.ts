import { describe, expect, it } from "vitest";
import type { Night, PlanResponse } from "../../../src/shared/contract.ts";
import { CANDIDATE } from "../helpers.ts";
import { createVenue, testApp, ORIGIN, req } from "../test_app.ts";

describe("MCP endpoint", () => {
  const headers = { accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25", origin: ORIGIN };
  const rpc = (method: string, params: Record<string, unknown> = {}, id = 1) => ({ jsonrpc: "2.0", id, method, params });

  it("initializes on protocol 2025-11-25 with a JSON response", async () => {
    const h = testApp();
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
    const h = testApp();
    const res = await req(h, "/mcp", { method: "POST", headers, body: rpc("tools/list") });
    const body = (await res.json()) as { result: { tools: Array<{ name: string; inputSchema: { properties: Record<string, unknown> } }> } };
    expect(body.result.tools.map((t) => t.name).sort()).toEqual(["find_venue", "log_turnout", "propose_night", "publish_night", "read_street"]);
    const publish = body.result.tools.find((t) => t.name === "publish_night")!;
    expect(Object.keys(publish.inputSchema.properties)).toEqual(expect.arrayContaining(["venue_id", "owner_token", "plan_id", "actions"]));
  });

  it("finds venues with structured content", async () => {
    const h = testApp();
    const res = await req(h, "/mcp", { method: "POST", headers, body: rpc("tools/call", { name: "find_venue", arguments: { name: "Blue Hour", city: "Berlin" } }) });
    const body = (await res.json()) as { result: { structuredContent: { candidates: unknown[] }; isError?: boolean } };
    expect(body.result.isError).toBeFalsy();
    expect(body.result.structuredContent.candidates).toEqual([CANDIDATE]);
  });

  it("refuses owner tools without the owner token", async () => {
    const h = testApp();
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

  it("proposes, sends the owner to the approval screen without publishing, and logs turnout", async () => {
    const h = testApp();
    const v = await createVenue(h);
    const auth = { venue_id: v.id, owner_token: v.token };
    const proposed = (await (
      await req(h, "/mcp", { method: "POST", headers, body: rpc("tools/call", { name: "propose_night", arguments: { ...auth, max_people: 25 } }) })
    ).json()) as { result: { structuredContent: PlanResponse } };
    const planId = proposed.result.structuredContent.plan.id;
    const pub = (await (
      await req(h, "/mcp", { method: "POST", headers, body: rpc("tools/call", { name: "publish_night", arguments: { ...auth, plan_id: planId, actions: ["event_page", "eventbrite"] } }) })
    ).json()) as { result: { structuredContent: { approveUrl: string; actions: Array<{ kind: string }> } } };
    expect(pub.result.structuredContent.approveUrl).toBe(`${ORIGIN}/v/${v.id}/night/${planId}/approve`);
    expect(pub.result.structuredContent.actions.map((a) => a.kind)).toEqual(["event_page", "eventbrite"]);
    const state = await (await req(h, `/api/venues/${v.id}`, { token: v.token })).text();
    expect(state).not.toContain("eventSlug");
    await req(h, `/api/venues/${v.id}/nights/${planId}/approve`, { method: "POST", token: v.token, body: { actions: ["event_page"] } });
    const logged = (await (
      await req(h, "/mcp", { method: "POST", headers, body: rpc("tools/call", { name: "log_turnout", arguments: { ...auth, night_id: planId, headcount: 12 } }) })
    ).json()) as { result: { structuredContent: { night: Night } } };
    expect(logged.result.structuredContent.night.headcount).toBe(12);
  });

  it("rejects GET and DELETE because it is stateless", async () => {
    const h = testApp();
    expect((await req(h, "/mcp")).status).toBe(405);
    expect((await req(h, "/mcp", { method: "DELETE" })).status).toBe(405);
  });
});

describe("MCP tool list for the How it works page", () => {
  it("is built from the same definitions the server registers", async () => {
    const h = testApp();
    const shown = (await (await req(h, "/api/mcp/tools")).json()) as { endpoint: string; tools: Array<{ name: string; title: string; description: string; readOnly: boolean; args: Array<{ name: string; required: boolean }> }> };
    const listed = (await (
      await req(h, "/mcp", { method: "POST", headers: { accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25", origin: ORIGIN }, body: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} } })
    ).json()) as { result: { tools: Array<{ name: string; title: string; description: string; annotations: { readOnlyHint: boolean }; inputSchema: { required?: string[]; properties: Record<string, unknown> } }> } };
    expect(shown.endpoint).toMatch(/\/mcp$/);
    expect(shown.tools.map((t) => t.name)).toEqual(listed.result.tools.map((t) => t.name));
    for (const t of shown.tools) {
      const live = listed.result.tools.find((x) => x.name === t.name)!;
      expect([t.title, t.description, t.readOnly]).toEqual([live.title, live.description, live.annotations.readOnlyHint === true]);
      expect(t.args.map((a) => a.name)).toEqual(Object.keys(live.inputSchema.properties));
      expect(t.args.filter((a) => a.required).map((a) => a.name)).toEqual(live.inputSchema.required ?? []);
    }
  });
});
