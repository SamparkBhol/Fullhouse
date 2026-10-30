import { pickCity } from "../support/city.ts";
import { expect, test } from "../support/test.ts";

test("the landing page says what Full House finds and looks the venue up as the owner types", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Full House");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your best partner is already on your street.");
  await expect(page.getByLabel("City", { exact: true })).toHaveValue("London");
  await expect(page.getByRole("button", { name: "use my location" })).toBeVisible();
  await expect(page.locator(".example")).toHaveCount(0);
  await expect(page.locator(".steps > li")).toHaveCount(5);
  await expect(page.getByRole("heading", { level: 2, name: "Qloo ranks. Full House decides." })).toBeVisible();
  await expect(page.getByText(/^What Qloo gives\./)).toBeVisible();
  await expect(page.getByText(/^What Full House adds\./)).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/\$\d|a month|no card|price|free/i);
  await expect(page.locator(".band-close").getByRole("link", { name: "Find your neighbour" })).toHaveAttribute("href", "#find");

  await pickCity(page, "Leeds");
  await page.getByRole("textbox", { name: "Your venue" }).fill("Larkspur Books");
  const picks = page.locator(".find-pick");
  await expect(picks.first()).toContainText("Larkspur Books");
  await expect(picks.first()).toContainText("Leeds");
  await expect(picks.first().locator(".find-address")).not.toBeEmpty();
});

test("the old start address opens the same one field search", async ({ page }) => {
  await page.goto("/start");
  await expect(page.getByRole("textbox", { name: "Your venue" })).toBeVisible();
  await expect(page.getByLabel("Time zone")).toHaveCount(0);
});

test("the how page lists every Qloo call, with no stale demographics row", async ({ page }) => {
  await page.goto("/how");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("How Full House works");
  await expect(page.locator("ol.calls > li")).toHaveCount(10);
  await expect(page.getByText("demographics")).toHaveCount(0);
  await expect(page.getByText("GET /v2/analysis/compare")).toBeVisible();
});

test("an unknown address shows the not found page", async ({ page }) => {
  await page.goto("/no/such/page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nothing at this address");
});
