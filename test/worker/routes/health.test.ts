import { describe, expect, it } from "vitest";
import { testApp, ORIGIN, req } from "../test_app.ts";

describe("health and headers", () => {
  it("reports what is configured without leaking secrets", async () => {
    const h = testApp();
    const res = await req(h, "/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: true, qloo: true, ai: false, tokens: true, ownerEmail: false });
    expect(JSON.stringify(body)).not.toContain("test-qloo-key");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("answers CORS only for its own origin", async () => {
    const h = testApp();
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
    const h = testApp();
    const res = await req(h, "/api/venues/search", { method: "POST", body: { name: "x", city: "y" }, headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
    expect(h.searches).toHaveLength(0);
  });

  it("caps bodies at 64 KB", async () => {
    const h = testApp();
    const res = await req(h, "/api/venues/search", { method: "POST", body: { name: "x".repeat(70 * 1024), city: "y" } });
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toBe("body_too_large");
  });

  it("wants JSON bodies", async () => {
    const h = testApp();
    const res = await req(h, "/api/venues/search", { method: "POST", body: "name=x", headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect(res.status).toBe(415);
  });

  it("returns ApiError JSON for unknown API routes", async () => {
    const h = testApp();
    const res = await req(h, "/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not_found" });
  });
});
