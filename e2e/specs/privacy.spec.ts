import { fakeQlooLog } from "../support/fake_log.ts";
import { BASE_URL, QLOO_HOSTS } from "../support/env.ts";
import { approveNight, createVenue, openAsOwner, planNight, readStreet } from "../support/owner.ts";
import { expect, test } from "../support/test.ts";

const QLOO_PATHS = ["/search", "/v2/insights", "/v2/analysis/compare"];

test("Qloo gets only the venue and public things, and every call carries the key", async ({ request }) => {
  const email = "owner.privacy@example.com";
  const owner = await createVenue(request, { name: "Larkspur Picture House", city: "Ghent", tz: "Europe/Brussels", ownerEmail: email });
  await readStreet(request, owner);
  const { plan } = await planNight(request, owner);
  const night = await approveNight(request, owner, plan, ["event_page", "ics", "owner_email"]);
  const logged = await request.post(`/api/venues/${owner.venue.id}/nights/${night.id}/result`, {
    headers: { authorization: `Bearer ${owner.token}` },
    data: { headcount: 41, note: "Quiet until the film started" },
  });
  expect(logged.ok()).toBe(true);

  const log = await fakeQlooLog();
  expect(log.length).toBeGreaterThan(12);
  const sent = JSON.stringify(log);
  expect(sent).not.toContain(email);
  expect(sent).not.toContain("@");
  expect(sent).not.toContain(owner.token);
  expect(sent).not.toContain(owner.venue.id);
  expect(sent).not.toContain("Quiet until the film started");
  expect(log.filter((r) => r.keyHeader !== "present" || !r.keyAccepted)).toEqual([]);
  expect(log.filter((r) => r.method !== "GET" || !QLOO_PATHS.includes(r.path))).toEqual([]);
  expect(log.filter((r) => r.status !== 200)).toEqual([]);
});

test("the browser only talks to Full House and the map tiles, never to Qloo", async ({ page, request, traffic }) => {
  const owner = await createVenue(request, { name: "Harbor Oyster House", city: "Portland", tz: "America/Los_Angeles" });
  await readStreet(request, owner);
  await openAsOwner(page, owner, "/street");
  await expect(page.locator(".map.leaflet-container .pin-venue")).toBeVisible();
  const tiles = (h: string) => h === "tile.openstreetmap.org" || h.endsWith(".tile.openstreetmap.org");
  const own = new URL(BASE_URL).host;
  expect(traffic.hosts()).toContain(own);
  expect(traffic.hosts().filter((h) => h !== own && !tiles(h))).toEqual([]);
  expect(traffic.hosts().filter((h) => QLOO_HOSTS.includes(h))).toEqual([]);
});
