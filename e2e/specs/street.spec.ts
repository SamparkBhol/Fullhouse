import { createVenue, openAsOwner } from "../support/owner.ts";
import { SIDEWAYS, SMALL_TARGETS } from "../support/layout.ts";
import { expect, test } from "../support/test.ts";

test("the street read shows the map, both tag lists, the gap, the picks and every call behind them", async ({ page, request }) => {
  const owner = await createVenue(request, { name: "Saltwater Records", city: "Ghent", tz: "Europe/Brussels" });
  await openAsOwner(page, owner, "/street");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your street");
  await page.getByRole("button", { name: "Read the street" }).click();
  await expect(page.getByRole("heading", { name: "Where your crowd gathers" })).toBeVisible();
  await expect(page.locator(".because-call:visible")).toHaveCount(0);
  const sources = page.locator("details.sources");
  await expect(sources).toHaveCount(1);
  await expect(sources).not.toHaveAttribute("open", "");
  await expect(sources.locator(".fold")).toHaveCount(5);
  const part = (name: string) => sources.locator(".fold").filter({ has: page.locator("h3", { hasText: new RegExp(`^${name}$`) }) });

  const map = page.locator(".map.leaflet-container");
  await expect(map).toBeVisible();
  // The specs refuse every request that leaves the Worker, map tiles too, so the page says the street plan did not load.
  await expect(page.getByText("The street plan did not load")).toBeVisible();
  await expect(map.locator(".pin-you")).toHaveCount(1);
  await expect(map.locator(".pin:not(.pin-you)")).not.toHaveCount(0);
  await expect.poll(() => map.locator(".leaflet-overlay-pane path").count()).toBeGreaterThan(20);
  const pinsOnTop = await map.locator(".pin").evaluateAll((pins) => {
    const boxes = pins.map((p) => p.getBoundingClientRect());
    return boxes.flatMap((a, i) => boxes.slice(i + 1).filter((b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)).length;
  });
  expect(pinsOnTop).toBe(0);
  const layers = page.locator(".layer-pick input[type=radio]");
  await expect(layers).toHaveCount(2);
  await layers.nth(1).check();
  await page.getByText("The map as a list").click();
  await expect(page.locator("details.more").filter({ hasText: "Strongest squares" }).locator("ol li").first()).toHaveText(/^1st strongest/);

  // The raw tag columns are gone: a venue is shown what it is liked for only when three telling tags survive the filter.
  await expect(page.locator(".tag-col")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("Fries");
  const gapsName = "What the places your crowd loves have that you do not";
  const gaps = page.locator("section", { has: page.getByRole("heading", { name: gapsName }) });
  await expect(gaps.locator("> p").first()).toHaveText(/^(Of the \d+ places nearby that Saltwater Records' audience also loves, how many carry each tag|The one place nearby that Saltwater Records' audience also loves carries each of these tags)\. Your venue carries none of them\.$/);
  await expect(part(gapsName).locator(".because-row").first()).toContainText(/Call \d+/);

  const picks = page.locator("section", { has: page.getByRole("heading", { name: "What they love beyond the street" }) });
  await expect(picks.locator(".kinds h3")).toHaveText(["Books", "Films", "TV shows", "Artists", "Podcasts"]);
  const books = picks.locator(".kinds > li").first();
  await expect(books.locator(".item")).toHaveCount(6);
  await expect(books.locator(".item").first().locator(".rank")).toHaveText("1st");
  await expect(part("What they love beyond the street")).toContainText(/Ranked among 10 artists for people who like Saltwater Records/);
  await expect(page.locator(".trend")).toHaveCount(0);

  const loved = page.locator("section", { has: page.getByRole("heading", { name: "Places your crowd loves nearby" }) });
  await expect(loved.locator("ol.items").first().locator("> .item")).toHaveCount(await map.locator(".pin:not(.pin-you)").count());
  await sources.locator("> summary").click();
  await expect(page.getByRole("heading", { name: "Your crowd, in aggregate" })).toHaveCount(0);
  await expect(sources.locator(".limits")).toContainText("Ranks are positions within one Qloo response.");

  await part("The map").locator(".fold-call").first().click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "Every call behind this read" })).toBeVisible();
  const state = (await (await request.get(`/api/venues/${owner.venue.id}`, { headers: { authorization: `Bearer ${owner.token}` } })).json()) as { read: { provenance: unknown[] } };
  expect(state.read.provenance.length).toBeLessThanOrEqual(30);
  await expect(drawer.locator(".call")).toHaveCount(state.read.provenance.length);
  await expect(drawer.locator(".call-endpoint").first()).toHaveText(/^GET \/v2\//);
  await expect(drawer).toContainText("GET /v2/analysis/compare");
  const paramNames = await drawer.locator(".call-params dt").allTextContents();
  expect(paramNames.filter((n) => /key|token|secret/i.test(n))).toEqual([]);
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toHaveCount(0);

  await part(gapsName).locator(".because-row").first().click();
  await expect(page.locator(".call-focus .call-endpoint")).toHaveText("GET /v2/analysis/compare");
});

test("the venue home shows the partner and plans the quiet night from the read", async ({ page, request }) => {
  const owner = await createVenue(request, { name: "Willow Wine Cellar", city: "Portland", tz: "America/Los_Angeles" });
  await openAsOwner(page, owner, "/street");
  await page.getByRole("button", { name: "Read the street" }).click();
  await expect(page.locator(".map.leaflet-container")).toBeVisible();
  await page.getByRole("link", { name: "Nights", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Willow Wine Cellar");
  await expect(page.getByRole("button", { name: "Plan a night for Tuesday" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Every Monday" })).toBeVisible();
});

test("on a 390 px phone the street fits the screen and every tab is a thumb sized target", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const owner = await createVenue(request, { name: "Saltmarsh Record Shop", city: "Leeds" });
  await openAsOwner(page, owner, "/street");
  await page.getByRole("button", { name: "Read the street" }).click();
  await expect(page.locator(".map.leaflet-container")).toBeVisible();
  expect(await page.evaluate<string[]>(SIDEWAYS)).toEqual([]);
  expect(await page.evaluate<string[]>(SMALL_TARGETS)).toEqual([]);
  const tabs = await page.locator("nav.tabs a").evaluateAll((as) => as.map((a) => a.getBoundingClientRect().height));
  expect(tabs).toHaveLength(5);
  expect(tabs.every((h) => h >= 44)).toBe(true);
});
