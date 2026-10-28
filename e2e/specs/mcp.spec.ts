import type { APIRequestContext } from "playwright/test";
import { createVenue } from "../support/owner.ts";
import { expect, test } from "../support/test.ts";

const PROTOCOL = "2025-11-25";

interface RpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

let nextId = 1;

async function rpc(request: APIRequestContext, method: string, params: Record<string, unknown> = {}): Promise<RpcResponse> {
  const res = await request.post("/mcp", {
    headers: { accept: "application/json, text/event-stream", "content-type": "application/json", "mcp-protocol-version": PROTOCOL },
    data: { jsonrpc: "2.0", id: nextId++, method, params },
  });
  expect(res.status(), await res.text()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/json");
  return (await res.json()) as RpcResponse;
}

test("the MCP endpoint initializes, lists the five tools and reads the street for an owner", async ({ request }) => {
  const init = await rpc(request, "initialize", { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "e2e", version: "1.0.0" } });
  expect(init.error).toBeUndefined();
  expect(init.result?.protocolVersion).toBe(PROTOCOL);
  expect(init.result?.serverInfo).toMatchObject({ name: "fullhouse" });
  expect(init.result?.capabilities).toHaveProperty("tools");

  const list = await rpc(request, "tools/list");
  const tools = (list.result?.tools ?? []) as Array<{ name: string; inputSchema: { type: string } }>;
  expect(tools.map((t) => t.name).sort()).toEqual(["find_venue", "log_turnout", "propose_night", "publish_night", "read_street"]);
  for (const t of tools) expect(t.inputSchema.type).toBe("object");

  const owner = await createVenue(request, { name: "Quarry Ramen Bar", city: "Portland", tz: "America/Los_Angeles" });
  const call = await rpc(request, "tools/call", { name: "read_street", arguments: { venue_id: owner.venue.id, owner_token: owner.token } });
  expect(call.result?.isError).toBeFalsy();
  const read = (call.result?.structuredContent as { read: { venueId: string; provenance: unknown[]; lovedPlaces: unknown[] } }).read;
  expect(read.venueId).toBe(owner.venue.id);
  expect(read.provenance).toHaveLength(12);
  expect(read.lovedPlaces.length).toBeGreaterThan(0);
  const text = (call.result?.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
  expect(text).toMatch(/^Street read at .+: \d+ loved places nearby, \d+ picks, \d+ gaps, 12 Qloo calls\./);

  const refused = await rpc(request, "tools/call", { name: "read_street", arguments: { venue_id: owner.venue.id, owner_token: "x".repeat(40) } });
  expect(refused.result?.isError).toBe(true);
  expect(JSON.stringify(refused.result?.content)).toContain("do not match");
});

test("find_venue over MCP returns Qloo candidates for a name and city", async ({ request }) => {
  const call = await rpc(request, "tools/call", { name: "find_venue", arguments: { name: "Alder Wine Bar", city: "Ghent" } });
  expect(call.result?.isError).toBeFalsy();
  const candidates = (call.result?.structuredContent as { candidates: Array<{ name: string; address?: string }> }).candidates;
  expect(candidates[0]).toMatchObject({ name: "Alder Wine Bar" });
  expect(candidates[0]?.address).toContain("Ghent");
});
