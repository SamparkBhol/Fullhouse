import { expect, test } from "../support/test.ts";

test("the landing page says what Full House finds and looks the venue up as the owner types", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Full House");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find the shop down the street that shares your customers.");
  await expect(page.getByLabel("City")).toHaveValue("London");
  await expect(page.locator(".example")).toHaveCount(0);
  await expect(page.locator(".counter")).toHaveCount(0);

  await page.getByLabel("City").fill("Leeds");
  await page.getByRole("textbox", { name: "Your venue" }).fill("Larkspur Books");
  const picks = page.locator(".find-pick");
  await expect(picks.first()).toContainText("Larkspur Books");
  await expect(picks.first()).toContainText("Leeds");
  await expect(page.getByRole("button", { name: /Look it up/ })).toHaveCount(0);
});

test("the old start address opens the same one field search", async ({ page }) => {
  await page.goto("/start");
  await expect(page.getByRole("textbox", { name: "Your venue" })).toBeVisible();
  await expect(page.getByLabel("Time zone")).toHaveCount(0);
});

test("the how page lists every Qloo call a read makes", async ({ page }) => {
  await page.goto("/how");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("How Full House works");
  await expect(page.locator("ol.calls > li")).toHaveCount(8);
  await expect(page.getByText("GET /v2/analysis/compare")).toBeVisible();
});

test("an unknown address shows the not found page", async ({ page }) => {
  await page.goto("/no/such/page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nothing at this address");
});
