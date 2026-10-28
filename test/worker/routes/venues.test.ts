import { describe, expect, it } from "vitest";
import type { VenueState } from "../../../src/shared/contract.ts";
import { ownerToken } from "../../../src/worker/owner_token.ts";
import { CANDIDATE } from "../helpers.ts";
import { CREATE_BODY, createVenue, testApp, ORIGIN, req } from "../test_app.ts";

describe("venue search and creation", () => {
  it("says plainly when the Qloo key is missing and returns no data", async () => {
    const h = testApp({ env: { QLOO_API_KEY: "" } });
    const res = await req(h, "/api/venues/search", { method: "POST", body: { name: "Blue Hour", city: "Berlin" } });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "qloo_key_missing" });
    expect(h.searches).toHaveLength(0);
  });

  it("returns candidates and wires Qloo with the secret, the default host and the meter budget", async () => {
    const h = testApp();
    const res = await req(h, "/api/venues/search", { method: "POST", body: { name: "Blue Hour", city: "Berlin" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([CANDIDATE]);
    expect(h.qlooOptions[0]?.apiKey).toBe("test-qloo-key");
    expect(h.qlooOptions[0]?.baseUrl).toBeUndefined();
    expect(typeof h.qlooOptions[0]?.budget).toBe("function");
  });

  it("passes QLOO_BASE_URL only when it is set", async () => {
    const h = testApp({ env: { QLOO_BASE_URL: "http://127.0.0.1:8788" } });
    await req(h, "/api/venues/search", { method: "POST", body: { name: "Blue Hour", city: "Berlin" } });
    expect(h.qlooOptions[0]?.baseUrl).toBe("http://127.0.0.1:8788");
  });

  it("rate limits searches per address", async () => {
    const h = testApp();
    for (let i = 0; i < 120; i++) await req(h, "/api/venues/search", { method: "POST", body: { name: "a", city: "b" } });
    const res = await req(h, "/api/venues/search", { method: "POST", body: { name: "a", city: "b" } });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    const other = await req(h, "/api/venues/search", { method: "POST", body: { name: "a", city: "b" }, headers: { "cf-connecting-ip": "198.51.100.1" } });
    expect(other.status).toBe(200);
  });

  it("counts an IPv6 caller by its /64, so rotating the last half of the address does not reset the limit", async () => {
    const h = testApp();
    for (let i = 0; i < 120; i++) {
      await req(h, "/api/venues/search", { method: "POST", body: { name: "a", city: "b" }, headers: { "cf-connecting-ip": `2001:db8:1:2::${i.toString(16)}` } });
    }
    const res = await req(h, "/api/venues/search", { method: "POST", body: { name: "a", city: "b" }, headers: { "cf-connecting-ip": "2001:db8:1:2:ffff::9" } });
    expect(res.status).toBe(429);
  });

  it("creates a venue from the candidate Qloo returns again, with an owner link", async () => {
    const h = testApp();
    const v = await createVenue(h);
    expect(v.ownerUrl).toBe(`${ORIGIN}/v/${v.id}#t=${v.token}`);
    expect(v.token).not.toBe(await ownerToken(h.deps.secret, v.id));
    expect(h.searches.at(-1)).toEqual({ name: CANDIDATE.name, city: "Berlin" });
    const state = (await (await req(h, `/api/venues/${v.id}`, { token: v.token })).json()) as VenueState;
    expect(state.venue.entity).toEqual(CANDIDATE);
    expect(state.venue).toMatchObject({ verified: false });
    expect(state.venue.ownerEmail).toBeUndefined();
    expect(state.nextAlarm).toBeTruthy();
  });

  it("refuses a candidate that Qloo does not return", async () => {
    const h = testApp();
    const res = await req(h, "/api/venues", { method: "POST", body: { ...CREATE_BODY, candidate: { id: "MADE-UP", name: "Fake" } } });
    expect(res.status).toBe(409);
    expect(h.venues.size).toBe(0);
  });

  it("validates the time zone, slot and email", async () => {
    const h = testApp();
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
    const h = testApp({ env: { TOKEN_SECRET: "" } });
    const res = await req(h, "/api/venues", { method: "POST", body: CREATE_BODY });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "token_secret_missing" });
  });
});
