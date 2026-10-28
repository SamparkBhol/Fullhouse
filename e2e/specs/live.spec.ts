import { PHONE, SIDEWAYS, SMALL_TARGETS } from "../support/layout.ts";
import { createVenue } from "../support/owner.ts";
import { expect, test } from "../support/test.ts";

// Browsers in a test never hide their tab, so the page is told it is hidden the way a real switch would.
const HIDE_TAB = `(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
})()`;

test("the landing page counts what happened and opens the live numbers", async ({ page, request }) => {
  await createVenue(request, { name: "Lantern Records", city: "Leeds" });
  await page.goto("/");
  const strip = page.locator("section", { has: page.getByRole("heading", { name: "Counted on this server" }) });
  await expect(strip.locator(".counter .sr-only").first()).toHaveText(/^[1-9]\d* venues? set up$/);
  await expect(strip).toContainText("nights published");

  await strip.getByRole("link", { name: "See the live numbers" }).click();
  await expect(page).toHaveURL(/\/live$/);
  await expect(page).toHaveTitle("Live numbers | Full House");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Live numbers");
  await expect(page.locator(".fascia-link")).toHaveAttribute("aria-current", "page");

  const venues = page.locator('[data-pane="venues"]');
  await expect(venues.locator(".counter .sr-only")).toHaveText(/^[1-9]\d* venues? set up$/);
  await expect(venues).toContainText("In the last 24 hours.");
  await expect(page.locator(".refresh-line")).toContainText("Checks every 30 s.");
  await expect(page.locator('[data-pane="endpoints"] tbody th', { hasText: /^\/search$/ })).toBeVisible();
  await expect(page.locator('[data-pane="budget"] .gauge-figure')).toContainText(/live calls? of 4,000 today/);
  await expect(page.locator('[data-pane="turnoutPeople"]')).toContainText("Head counts show here once 5 nights are logged");

  // The edge keeps an answer for up to 10 seconds, so the new venue can take one more check to reach the log.
  await page.getByRole("radio", { name: "10 s" }).check();
  await expect(page.locator('[data-pane="log"]')).toContainText("A venue was set up.", { timeout: 25_000 });
  await expect(page.locator('[data-pane="log"]')).not.toContainText("Lantern Records");
});

test("every chart on /live reads as a table and by keyboard", async ({ page }) => {
  await page.goto("/live");
  const calls = page.locator('[data-pane="calls"]');
  await expect(calls.locator(".chart-frame")).toBeVisible();
  await calls.getByText("Show as a table").click();
  await expect(calls.locator("thead th")).toHaveText(["Time", "Live calls", "From cache", "Errors"]);
  await expect(calls.locator("tbody tr")).toHaveCount(24);

  await calls.locator(".chart-frame").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(calls.locator(".tip")).toBeVisible();
  await expect(calls.locator(".tip .tip-title")).toHaveText(/ to /);
  await page.keyboard.press("Escape");
  await expect(calls.locator(".tip")).toBeHidden();

  await page.locator(".stat-row > details > summary").click();
  await expect(page.locator(".stat-row thead th")).toHaveText(["Time", "Venues", "Street reads", "Nights published", "RSVPs"]);
});

test("the pickers change the range and the polling, and the page says what it is doing", async ({ page }) => {
  await page.goto("/live");
  await expect(page.locator('[data-pane="venues"]')).toBeVisible();

  const week = page.waitForRequest((r) => r.url().endsWith("/api/stats?range=7d"));
  await page.getByRole("radio", { name: "7 days" }).check();
  await week;
  await expect(page).toHaveURL(/\/live\?range=7d$/);
  await expect(page.locator('[data-pane="venues"]')).toContainText("In the last 7 days.");
  await expect(page.locator('[data-pane="calls"] .pane-line')).toContainText(/six hours/);

  await page.getByRole("radio", { name: "Off" }).check();
  await expect(page).toHaveURL(/\/live\?range=7d&refresh=off$/);
  await expect(page.locator(".refresh-line")).toContainText("Auto refresh off.");
  await expect(page.locator(".refresh-line .pulse")).toHaveClass(/pulse-off/);

  const conditional = page.waitForRequest((r) => r.url().includes("/api/stats") && Boolean(r.headers()["if-none-match"]));
  await page.getByRole("button", { name: "Check now" }).click();
  expect((await conditional).headers()["if-none-match"]).toMatch(/^"[0-9a-f]{24}"$/);

  await page.getByRole("radio", { name: "10 s" }).check();
  await expect(page.locator(".refresh-line")).toContainText("Checks every 10 s.");
  await expect(page.locator(".refresh-line .pulse")).toHaveClass(/pulse-on/);
  await page.evaluate(HIDE_TAB);
  await expect(page.locator(".refresh-line")).toContainText("Paused while this tab is hidden.");

  await page.reload();
  await expect(page.getByRole("radio", { name: "7 days" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "10 s" })).toBeChecked();
});

test("the same numbers read as plain text with no JavaScript", async ({ page, browser }) => {
  await page.goto("/how");
  await page.getByRole("link", { name: "Live numbers" }).click();
  await expect(page).toHaveURL(/\/live$/);
  await page.getByRole("link", { name: "The same numbers as plain text" }).click();
  await expect(page).toHaveURL(/\/live\.txt$/);
  await expect(page.locator("body")).toContainText("Full House, live numbers");

  const noScript = await browser.newContext({ javaScriptEnabled: false, baseURL: new URL(page.url()).origin });
  const plain = await noScript.newPage();
  await plain.goto("/live");
  await expect(plain.getByRole("link", { name: "/live.txt" })).toHaveAttribute("href", "/live.txt");
  await noScript.close();
});

for (const size of [PHONE, { width: 390, height: 844 }]) {
  test(`/live fits a ${size.width} px phone with thumb sized controls`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/live");
    await expect(page.locator('[data-pane="log"]')).toBeVisible();
    expect(await page.evaluate<string[]>(SIDEWAYS)).toEqual([]);
    expect(await page.evaluate<string[]>(SMALL_TARGETS)).toEqual([]);
  });
}
