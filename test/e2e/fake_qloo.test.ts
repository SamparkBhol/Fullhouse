import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startFakeQloo, type FakeQloo } from "../../e2e/fake-qloo/server.ts";

const KEY = "fake-test-key";
let fake: FakeQloo;

beforeAll(async () => {
  fake = await startFakeQloo({ apiKey: KEY });
});
afterAll(() => fake.close());
beforeEach(() => fake.log.clear());

async function get(path: string, params: Record<string, string>, key: string | null = KEY): Promise<{ status: number; body: any }> {
  const res = await fetch(`${fake.url}${path}?${new URLSearchParams(params)}`, { headers: key === null ? {} : { "X-Api-Key": key } });
  return { status: res.status, body: await res.json() };
}

const POINT = "POINT(-1.5401 53.7964)";

describe("fake Qloo server", () => {
  it("refuses a request without the key header and one with the wrong key", async () => {
    const missing = await get("/search", { query: "Juniper Books Leeds" }, null);
    expect(missing.status).toBe(401);
    expect(missing.body.error.reason).toBe("No API key found in request");
    const wrong = await get("/search", { query: "Juniper Books Leeds" }, "nope");
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.reason).toBe("API keys mismatch");
    expect(fake.log.list().map((r) => [r.keyHeader, r.keyAccepted, r.status])).toEqual([
      ["missing", false, 401],
      ["present", false, 401],
    ]);
  });

  it("logs the path and query of every request but never the key", async () => {
    await get("/v2/insights", { "filter.type": "urn:tag", "signal.location": POINT });
    const [entry] = fake.log.list();
    expect(entry).toMatchObject({ method: "GET", path: "/v2/insights", keyHeader: "present", keyAccepted: true, status: 200 });
    expect(entry?.query).toEqual({ "filter.type": "urn:tag", "signal.location": POINT });
    expect(JSON.stringify(fake.log.list())).not.toContain(KEY);
  });

  it("finds the named venue in the asked city first", async () => {
    const { status, body } = await get("/search", { query: "Juniper Books Leeds", types: "urn:entity:place", take: "8" });
    expect(status).toBe(200);
    expect(body.results[0]).toMatchObject({ name: "Juniper Books", types: ["urn:entity:place"] });
    expect(body.results[0].properties.address).toContain("Leeds");
    expect(body.results[0].location).toEqual({ lat: expect.any(Number), lon: expect.any(Number) });
  });

  it("fills the place and work properties the parser reads", async () => {
    const place = (await get("/search", { query: "Juniper Books Leeds", types: "urn:entity:place" })).body.results[0];
    expect(place.properties).toMatchObject({ website: expect.stringMatching(/^https:\/\/[a-z0-9]+\.example$/), image: { url: expect.any(String) } });
    const works = await get("/v2/insights", { "filter.type": "urn:entity:movie", "signal.interests.entities": place.entity_id, take: "2" });
    expect(works.body.results.entities[0].properties).toMatchObject({ description: expect.any(String), image: { url: expect.any(String) } });
  });

  it("answers differently for different venues and the same for the same request", async () => {
    const venueId = async (name: string) => (await get("/search", { query: `${name} Leeds` })).body.results[0].entity_id as string;
    const a = await venueId("Juniper Books");
    const b = await venueId("Copper Taproom");
    const artists = async (id: string) =>
      (await get("/v2/insights", { "filter.type": "urn:entity:artist", "signal.interests.entities": id, "signal.location": POINT, take: "5" })).body.results.entities.map(
        (e: { name: string }) => e.name,
      );
    expect(await artists(a)).toEqual(await artists(a));
    expect(await artists(a)).not.toEqual(await artists(b));
  });

  it("uses the live error layouts for a bad insights request and a bad search", async () => {
    const insights = await get("/v2/insights", { "filter.type": "urn:entity:place", "filter.location": "53.79,-1.54" });
    expect(insights.status).toBe(400);
    expect(insights.body.errors[0].message).toMatch(/WKT/);
    const search = await get("/search", { query: "x", "filter.location": POINT });
    expect(search.status).toBe(400);
    expect(search.body.error).toMatchObject({ code: 400, reason: "Bad Request" });
  });

  it("refuses bias.trends for books like the live API", async () => {
    const res = await get("/v2/insights", { "filter.type": "urn:entity:book", "signal.location": POINT, "bias.trends": "high" });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].message).toContain("does not yet support trending");
  });
});
