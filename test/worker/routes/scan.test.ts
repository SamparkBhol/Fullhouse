import { describe, expect, it } from "vitest";
import type { ScanAnswer, ScanRecord } from "../../../src/shared/scan.ts";
import { ScanStore } from "../../../src/worker/scan/store.ts";
import { memorySql } from "../stats/sqlite.ts";
import { req, testApp } from "../test_app.ts";

const totals = { venues: 42, matched: 42, twoWay: 23, medianFit: 78.5, medianWalk: 6.5, openTogether: 18, formats: [{ format: "book_then_film", label: "book then film", n: 6 }] };

const RECORD: ScanRecord = {
  at: "2026-10-30T10:50:44.352Z",
  calls: 487,
  method: "Each venue was found with Full House's own place search and read by its own engine.",
  walkMax: 10,
  overall: totals as ScanRecord["overall"],
  cities: [
    { city: "New York", totals: { ...totals, venues: 21, matched: 21, twoWay: 12, openTogether: 9 } as ScanRecord["overall"] },
    { city: "London", totals: { ...totals, venues: 21, matched: 21, twoWay: 11, openTogether: 9 } as ScanRecord["overall"] },
  ],
};

function scanApp() {
  const sql = memorySql();
  const store = new ScanStore(sql);
  return { h: testApp({ scans: store }), store, sql };
}

describe("the street scan routes", () => {
  it("answers no scan until one is stored", async () => {
    const { h } = scanApp();
    const res = await req(h, "/api/scan");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect((await res.json()) as ScanAnswer).toEqual({ scan: null });
  });

  it("stores a record only with the server's own secret, and serves the latest", async () => {
    const { h } = scanApp();
    expect((await req(h, "/api/admin/scan", { method: "POST", body: RECORD })).status).toBe(401);
    expect((await req(h, "/api/admin/scan", { method: "POST", body: RECORD, token: "not-the-secret" })).status).toBe(401);
    const ok = await req(h, "/api/admin/scan", { method: "POST", body: RECORD, token: h.deps.secret });
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual({ stored: RECORD.at });
    const later = { ...RECORD, at: "2026-10-31T09:00:00.000Z", calls: 500 };
    expect((await req(h, "/api/admin/scan", { method: "POST", body: later, token: h.deps.secret })).status).toBe(201);
    expect(((await (await req(h, "/api/scan")).json()) as ScanAnswer).scan).toEqual(later);
  });

  it("refuses a record that names a venue or does not add up", async () => {
    const { h } = scanApp();
    const named = { ...RECORD, overall: { ...RECORD.overall, venue: "Housing Works Bookstore" } };
    const bad = await req(h, "/api/admin/scan", { method: "POST", body: named, token: h.deps.secret });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: "invalid_input" });
    const wrong = { ...RECORD, overall: { ...RECORD.overall, twoWay: 50 } };
    expect((await req(h, "/api/admin/scan", { method: "POST", body: wrong, token: h.deps.secret })).status).toBe(400);
    expect(((await (await req(h, "/api/scan")).json()) as ScanAnswer).scan).toBeNull();
  });

  it("answers 503 on a server that keeps no stats, and refuses posts when no secret is set", async () => {
    const h = testApp();
    expect((await req(h, "/api/scan")).status).toBe(503);
    const unset = testApp({ env: { TOKEN_SECRET: "" }, scans: new ScanStore(memorySql()) });
    expect((await req(unset, "/api/admin/scan", { method: "POST", body: RECORD, token: "x" })).status).toBe(503);
  });
});

describe("the scan store", () => {
  it("reads the newest record back after a restart and keeps the last twelve", async () => {
    const sql = memorySql();
    const first = new ScanStore(sql);
    expect(await first.latestScan()).toBeNull();
    for (let i = 0; i < 15; i++) await first.putScan({ ...RECORD, calls: i });
    const again = new ScanStore(sql);
    expect((await again.latestScan())?.calls).toBe(14);
    expect(sql.exec("SELECT COUNT(*) AS n FROM scan_record").toArray()[0]?.["n"]).toBe(12);
  });
});
