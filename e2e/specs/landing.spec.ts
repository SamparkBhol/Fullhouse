import { expect, test } from "../support/test.ts";

test("the landing page says what Full House does and leads to the venue search", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Full House");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fill your quiet night");
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
  await expect(page.locator(".steps > li")).toHaveCount(3);

  await page.getByRole("link", { name: "Find your venue" }).first().click();
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find your venue");
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
