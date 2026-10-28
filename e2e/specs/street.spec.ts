import { createVenue, openAsOwner } from "../support/owner.ts";
import { expect, test } from "../support/test.ts";

test("the street read shows the map, both tag lists, the gap, the picks and every Qloo call behind them", async ({ page, request }) => {
  const owner = await createVenue(request, { name: "Saltwater Records", city: "Ghent", tz: "Europe/Brussels" });
  await openAsOwner(page, owner, "/street");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The street around you");
  await page.getByRole("button", { name: "Read the street" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The street around you");
  const calls = page.getByRole("button", { name: /^All \d+ Qloo calls$/ });
  await expect(calls).toHaveText("All 12 Qloo calls");

  const map = page.locator(".map.leaflet-container");
  await expect(map).toBeVisible();
  await expect(map.locator(".pin-venue")).toHaveCount(1);
  await expect(map.locator(".pin-place")).not.toHaveCount(0);
  const cells = map.locator(".leaflet-overlay-pane path");
  await expect.poll(() => cells.count()).toBeGreaterThan(20);
  const layers = page.locator(".layer-pick input[type=radio]");
  await expect(layers).toHaveCount(2);
  await layers.nth(1).check();
  await page.locator(".map-text summary").click();
  await expect(page.locator(".cell-list li").first()).toHaveText(/^1st strongest/);

  const tagCols = page.locator(".tag-col");
  await expect(tagCols).toHaveCount(2);
  await expect(tagCols.nth(0).locator("h3")).toHaveText("The street");
  await expect(tagCols.nth(0).locator("ul.tag-set > li")).toHaveCount(10);
  await expect(tagCols.nth(0).locator(".rank-no")).toHaveCount(0);
  await expect(tagCols.nth(1).locator("h3")).toHaveText("Saltwater Records");
  await expect(tagCols.nth(1).locator("ol.ranked > li")).not.toHaveCount(0);

  const gaps = page.locator("section", { has: page.getByRole("heading", { name: "Found nearby, not here" }) });
  await expect(gaps.locator(".pick").first()).toContainText(/of the 5 places nearby that Saltwater Records' audience also loves are tagged/);
  await expect(gaps.locator(".because-row").first()).toContainText(/Call \d+/);

  const picks = page.locator("section", { has: page.getByRole("heading", { name: "What people who like Saltwater Records love" }) });
  await expect(picks.locator(".pick-group h3")).toHaveText(["Artists", "Books", "Films", "TV shows", "Podcasts"]);
  const artists = picks.locator(".pick-group").first();
  await expect(artists.locator(".list-reason")).toContainText(/Ranked among 10 artists for people who like Saltwater Records/);
  await expect(artists.locator("ol.picks").first().locator("> .pick")).toHaveCount(5);
  await expect(artists.locator("details.more summary")).toHaveText("5 more");
  await expect(page.locator(".trend")).toHaveCount(0);

  const loved = page.locator("section", { has: page.getByRole("heading", { name: "Places nearby your audience loves" }) });
  await expect(loved.locator("ol.top-places > .pick")).toHaveCount(await map.locator(".pin-place").count());
  await expect(page.getByRole("heading", { name: "Who your audience is, in aggregate" })).toBeVisible();
  await expect(page.locator(".limits")).toContainText("Ranks are positions within one Qloo response.");

  await calls.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "Qloo calls behind this read" })).toBeVisible();
  await expect(drawer.locator(".receipt-line")).toHaveCount(12);
  await expect(drawer.locator(".receipt-endpoint").first()).toHaveText(/^GET \/v2\//);
  await expect(drawer).toContainText("GET /v2/analysis/compare");
  const paramNames = await drawer.locator(".receipt-params dt").allTextContents();
  expect(paramNames.filter((n) => /key|token|secret/i.test(n))).toEqual([]);
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toHaveCount(0);

  await gaps.locator(".because-row").first().click();
  await expect(page.locator(".receipt-focus .receipt-endpoint")).toHaveText("GET /v2/analysis/compare");
});

test("the venue home sums up the read", async ({ page, request }) => {
  const owner = await createVenue(request, { name: "Willow Wine Cellar", city: "Portland", tz: "America/Los_Angeles" });
  await openAsOwner(page, owner);
  await page.getByRole("button", { name: "Read the street" }).click();
  const street = page.locator("section", { has: page.getByRole("heading", { name: "The street" }) });
  await expect(street.locator("dd").nth(0)).not.toBeEmpty();
  await expect(street.locator("dd").nth(2)).not.toHaveText(/Qloo returned no/);
  await expect(page.getByRole("button", { name: "Plan a night for Tuesday" })).toBeVisible();
});
