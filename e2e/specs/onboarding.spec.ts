import { expect, test } from "../support/test.ts";

test("an owner finds the venue on Qloo, sets the quiet night, gets the owner link and reaches a first plan in one press", async ({ page }) => {
  await page.goto("/start");
  await page.getByRole("button", { name: "Look it up" }).click();
  await expect(page.getByRole("alert")).toHaveText("Type both the venue name and the city.");

  await page.getByLabel("Venue name").fill("Larkspur Books");
  await page.getByLabel("City").fill("Leeds");
  await page.getByRole("button", { name: "Look it up" }).click();

  const candidates = page.locator(".candidate");
  await expect(page.locator(".candidates legend")).toHaveText(/Qloo found \d+ places\. Which one is yours\?/);
  await expect(candidates.first()).toContainText("Larkspur Books");
  await expect(candidates.first()).toContainText("Leeds");

  await candidates.first().locator("label").click();
  await page.getByRole("button", { name: "This is my venue" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your quiet night");
  await expect(page.locator(".picked-name")).toHaveText("Larkspur Books");
  await page.getByLabel("Thursday").check();
  await page.getByLabel("How many people fit").fill("35");
  await expect(page.getByLabel("Time zone")).toHaveValue("Europe/London");
  await expect(page.getByText("From the venue's address. Change it if it is wrong.")).toBeVisible();
  await expect(page.getByLabel("Your email")).toHaveCount(0);
  await page.getByRole("button", { name: "Create my venue" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Larkspur Books is on Full House");
  const link = await page.getByLabel("Owner link", { exact: true }).inputValue();
  expect(link).toMatch(/\/v\/[^/#]+#t=.{20,}$/);

  await page.getByRole("button", { name: "Read the street and plan Thursday" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^A night for Thursday \d+ \w+$/);
  await expect(page.locator(".venue-name")).toHaveText("Larkspur Books");
  await expect(page.locator(".venue-meta")).toContainText("Leeds");
});

test("a venue page without the owner link asks for it", async ({ page }) => {
  await page.goto("/v/abcdefghijklmnopqrstuv");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Open your owner link");
});
