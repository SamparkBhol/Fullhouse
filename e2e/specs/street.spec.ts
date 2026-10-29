import { createVenue, openAsOwner } from "../support/owner.ts";
import { expect, test } from "../support/test.ts";

test("the street read shows the map, both tag lists, the gap, the picks and every Qloo call behind them", async ({ page, request }) => {
  const owner = await createVenue(request, { name: "Saltwater Records", city: "Ghent", tz: "Europe/Brussels" });
  await openAsOwner(page, owner, "/street");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The street around you");
  await page.getByRole("button", { name: "Read the street" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The street around you");
  await expect(page.getByRole("button", { name: /Qloo calls$/ })).toHaveCount(0);
  await expect(page.locator(".because-call:visible")).toHaveCount(0);
  const receipts = page.locator("details.receipts");
  await expect(receipts).toHaveCount(1);
  await expect(receipts).not.toHaveAttribute("open", "");
  await expect(receipts.locator(".fold")).toHaveCount(6);
  const part = (name: string) => receipts.locator(".fold").filter({ has: page.locator(".fold-title", { hasText: new RegExp(`^${name}$`) }) });

  const map = page.locator(".map.leaflet-container");
  await expect(map).toBeVisible();
  // The specs refuse every request that leaves the Worker, map tiles too, so the page says the street plan did not load.
  await expect(page.locator(".map-tiles-note")).toBeVisible();
  await expect(map.locator(".pin-venue")).toHaveCount(1);
  await expect(map.locator(".pin-place")).not.toHaveCount(0);
  const windows = map.locator(".leaflet-windows-pane path.win-lit");
  await expect.poll(() => windows.count()).toBeGreaterThan(20);
  await expect(map.locator(".leaflet-overlay-pane path.win")).toHaveCount(0);
  const pinsOnTop = await map.locator(".pin").evaluateAll((pins) => {
    const boxes = pins.map((p) => p.getBoundingClientRect());
    return boxes.flatMap((a, i) => boxes.slice(i + 1).filter((b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)).length;
  });
  expect(pinsOnTop).toBe(0);
  const layers = page.locator(".layer-pick input[type=radio]");
  await expect(layers).toHaveCount(2);
  await layers.nth(1).check();
  await page.locator(".map-text summary").click();
  await expect(page.locator(".cell-list li").first()).toHaveText(/^1st strongest/);

  const tagCols = receipts.locator(".tag-col");
  await expect(tagCols).toHaveCount(2);
  await expect(tagCols.nth(0).locator("h4")).toHaveText("The street");
  await expect(tagCols.nth(0).locator("ul.tag-set > li")).toHaveCount(10);
  await expect(tagCols.nth(0).locator(".rank-no")).toHaveCount(0);
  await expect(tagCols.nth(1).locator("h4")).toHaveText("Saltwater Records");
  await expect(tagCols.nth(1).locator("ol.ranked > li")).not.toHaveCount(0);

  const gaps = page.locator(".slate-gaps");
  await expect(gaps.getByRole("heading", { name: "Found nearby, not here" })).toBeVisible();
  await expect(gaps.locator(".slate-intro")).toHaveText("Of the 5 places nearby that Saltwater Records' audience also loves, how many carry each tag. Your venue carries none of them.");
  await expect(gaps.locator(".slate-lines li .slate-count").first()).toHaveText(/^\d of 5$/);
  await expect(part("Found nearby, not here").locator(".because-row").first()).toContainText(/Call \d+/);

  const picks = page.locator(".street-picks");
  await expect(picks.getByRole("heading", { level: 2 })).toHaveText("What people who like Saltwater Records love");
  await expect(picks.locator(".pick-group h3")).toHaveText(["Artists", "Books", "Films", "TV shows", "Podcasts"]);
  const artists = picks.locator(".pick-group").first();
  await expect(artists.locator("ol.shelf-row > .shelf-item")).toHaveCount(10);
  await expect(artists.locator(".shelf-item").first().locator(".shelf-line")).toHaveText("1st");
  await expect(artists.locator(".shelf-item.shelf-square")).toHaveCount(10);
  await expect(picks.locator(".pick-group").nth(1).locator(".shelf-item.shelf-portrait")).toHaveCount(10);
  await expect(part("The picks on the shelves")).toContainText(/Ranked among 10 artists for people who like Saltwater Records/);
  await expect(page.locator(".trend")).toHaveCount(0);

  const loved = page.locator(".ledge-loved");
  await expect(loved.getByRole("heading", { name: "Places nearby your audience loves" })).toBeVisible();
  await expect(loved.locator("ol.postcards").first().locator("> .postcard")).toHaveCount(await map.locator(".pin-place").count());
  await expect(page.getByRole("heading", { name: "Who your audience is, in aggregate" })).toBeHidden();
  await receipts.locator("> summary").click();
  await expect(page.getByRole("heading", { name: "Who your audience is, in aggregate" })).toBeVisible();
  await expect(receipts.locator(".limits")).toContainText("Ranks are positions within one Qloo response.");

  await part("The night map").locator(".fold-call").first().click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "Qloo calls behind this read" })).toBeVisible();
  await expect(drawer.locator(".receipt-line")).toHaveCount(12);
  await expect(drawer.locator(".receipt-endpoint").first()).toHaveText(/^GET \/v2\//);
  await expect(drawer).toContainText("GET /v2/analysis/compare");
  const paramNames = await drawer.locator(".receipt-params dt").allTextContents();
  expect(paramNames.filter((n) => /key|token|secret/i.test(n))).toEqual([]);
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toHaveCount(0);

  await part("Found nearby, not here").locator(".because-row").first().click();
  await expect(page.locator(".receipt-focus .receipt-endpoint")).toHaveText("GET /v2/analysis/compare");
});

test("the venue home dresses its window with the week's picks", async ({ page, request }) => {
  const owner = await createVenue(request, { name: "Willow Wine Cellar", city: "Portland", tz: "America/Los_Angeles" });
  await openAsOwner(page, owner, "/street");
  await page.getByRole("button", { name: "Read the street" }).click();
  await expect(page.locator(".street-map .map")).toBeVisible();
  await page.getByRole("link", { name: "Nights", exact: true }).click();
  const window = page.locator("section", { has: page.getByRole("heading", { name: "This week's window" }) });
  await expect(window.locator(".shelf-item")).toHaveCount(10);
  await expect(window.locator(".shelf-line").first()).toHaveText(/^Top artist$/);
  await expect(window.locator(".postcard-walk").first()).toContainText("min walk");
  await expect(page.getByRole("button", { name: "Plan a night for Tuesday" })).toBeVisible();
});

// Scrolls the map's middle down to the tab bar, then names each tab whose middle point is covered by something else.
const MAP_UNDER_TABS = `(() => {
  const map = document.querySelector(".map");
  window.scrollBy(0, map.getBoundingClientRect().top + map.clientHeight / 2 - window.innerHeight + 20);
  return [...document.querySelectorAll("nav.tabs a")]
    .filter((a) => {
      const r = a.getBoundingClientRect();
      return !a.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    })
    .map((a) => a.textContent);
})()`;

test("on a 390 px phone the tab bar stays on top of the map", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const owner = await createVenue(request, { name: "Saltmarsh Record Shop", city: "Leeds" });
  await openAsOwner(page, owner, "/street");
  await page.getByRole("button", { name: "Read the street" }).click();
  const map = page.locator(".map.leaflet-container");
  await expect(map).toBeVisible();
  expect(await page.evaluate<string[]>(MAP_UNDER_TABS)).toEqual([]);
  const [mapBox, tabsBox] = await Promise.all([map.boundingBox(), page.locator("nav.tabs").boundingBox()]);
  expect((mapBox?.y ?? 0) + (mapBox?.height ?? 0)).toBeGreaterThan(tabsBox?.y ?? Infinity);
  await page.screenshot({ path: test.info().outputPath("street-390.png") });
});
