import type { Page } from "playwright/test";
import { SIDEWAYS, SMALL_TARGETS } from "../support/layout.ts";
import { expect, test } from "../support/test.ts";

async function fits(page: Page): Promise<void> {
  expect(await page.evaluate<string[]>(SIDEWAYS)).toEqual([]);
  expect(await page.evaluate<string[]>(SMALL_TARGETS)).toEqual([]);
}

test("an owner goes from one field to an invite, and the neighbour's yes on a second page flips the owner's screen", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("City").fill("Leeds");
  await page.getByRole("textbox", { name: "Your venue" }).fill("Larkspur Books");
  const pick = page.locator(".find-pick").filter({ hasText: "Larkspur Books" }).first();
  await expect(pick).toBeVisible();
  await fits(page);
  await pick.click();

  const heading = page.getByRole("heading", { level: 1 });
  await expect(page).toHaveURL(/\/v\/[^/]+\/first$/);
  await expect(heading).toHaveText("Your crowd", { timeout: 30_000 });
  await expect(page.locator(".venue-name")).toHaveText("Larkspur Books");
  await expect(page.getByRole("navigation", { name: "Your venue" })).toBeHidden();
  await expect(page.locator(".crowd-pick").first().locator(".crowd-kind")).toHaveText(/^Your crowd's /);
  await expect(page.getByText(/Qloo calls?/)).toHaveCount(0);
  await fits(page);
  await page.getByRole("link", { name: "See your match" }).click();

  await expect(heading).toHaveText(/^Your crowd's other favourite place is .+, (\d+ minutes?|a short walk) away\.$/, { timeout: 30_000 });
  const partner = /place is (.+), (?:\d+ minutes?|a short walk) away\.$/.exec((await heading.textContent()) ?? "")?.[1] ?? "";
  expect(partner).not.toBe("");
  await expect(page.getByRole("heading", { name: "What both crowds share" })).toBeVisible();
  await expect(page.locator(".match-hours")).toHaveText(/^(Open \w+s .+|Qloo has no hours for it, check first|Qloo lists it as closed .+)\.?$/);
  await fits(page);
  await page.getByRole("link", { name: "See the night both crowds want" }).click();

  await expect(heading).toHaveText(/^(The night both crowds want|Your crowd's night)$/, { timeout: 45_000 });
  await expect(page.locator(".first-night .flyer")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Tuesday" })).toBeChecked();
  await expect(page.locator(".options")).toHaveCount(0);
  await fits(page);
  await page.getByRole("button", { name: `Ask ${partner}` }).click();

  await expect(heading).toHaveText(`Waiting for ${partner}`);
  const link = await page.getByLabel("Their invite link").inputValue();
  expect(link).toMatch(/\/i\/[^/?#]+$/);
  await expect(page.getByText("Open your venue on another phone")).toBeVisible();
  await fits(page);

  const neighbour = await page.context().newPage();
  await neighbour.goto(link);
  await expect(neighbour.locator("body")).toContainText(partner);
  await neighbour.getByRole("button", { name: /^We.re in$/ }).click();

  await expect(heading).toHaveText(`${partner} is in`, { timeout: 15_000 });
  await page.getByRole("button", { name: "Publish the night" }).click();
  await expect(heading).toHaveText("Published");
  const event = await page.getByRole("link", { name: "Open the event page" }).getAttribute("href");
  expect(event).toMatch(/\/e\/[^/]+$/);
  await neighbour.goto(event ?? "");
  await expect(neighbour.locator("body")).toContainText(partner);
  await expect(neighbour.locator("body")).toContainText("Larkspur Books");
});

test("until the partner answers, the waiting screen offers no way to publish", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByLabel("City").fill("Leeds");
  await page.getByRole("textbox", { name: "Your venue" }).fill("Juniper Books");
  await page.locator(".find-pick").filter({ hasText: "Juniper Books" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your crowd", { timeout: 30_000 });
  await page.getByRole("link", { name: "See your match" }).click();
  await page.getByRole("link", { name: "See the night both crowds want" }).click();
  const ask = page.getByRole("button", { name: /^Ask / });
  const partner = ((await ask.textContent()) ?? "").replace(/^Ask /, "");
  await ask.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Waiting for ${partner}`);
  await expect(page.getByRole("button", { name: "Publish the night" })).toHaveCount(0);
});

test("a venue page without the owner link asks for it", async ({ page }) => {
  await page.goto("/v/abcdefghijklmnopqrstuv");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Open your owner link");
});
