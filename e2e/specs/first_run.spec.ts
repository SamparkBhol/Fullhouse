import type { Page } from "playwright/test";
import { SIDEWAYS, SMALL_TARGETS } from "../support/layout.ts";
import { pickCity } from "../support/city.ts";
import { expect, test } from "../support/test.ts";

async function fits(page: Page): Promise<void> {
  expect(await page.evaluate<string[]>(SIDEWAYS)).toEqual([]);
  expect(await page.evaluate<string[]>(SMALL_TARGETS)).toEqual([]);
}

test("an owner goes from one field to an invite, and the neighbour's yes on a second page flips the owner's screen", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await pickCity(page, "Leeds");
  await page.getByRole("textbox", { name: "Your venue" }).fill("Larkspur Books");
  const pick = page.locator(".find-pick").filter({ hasText: "Larkspur Books" }).first();
  await expect(pick).toBeVisible();
  await fits(page);
  await pick.click();

  const heading = page.getByRole("heading", { level: 1 });
  await expect(page).toHaveURL(/\/v\/[^/]+\/first$/);
  await expect(heading).toHaveText("Your crowd", { timeout: 30_000 });
  await expect(page.locator(".venue-name")).toHaveText("Larkspur Books");
  await expect(page.getByRole("navigation", { name: "Your venue" })).toHaveCount(0);
  await expect(page.locator(".stepper [aria-current=step] .step-no")).toHaveText("1");
  await expect(page.getByRole("heading", { name: "Places your crowd loves nearby" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where your crowd gathers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /three things about your room$/i })).toBeVisible();
  await expect(page.locator(".items .item .cover .cover-paper").first()).not.toHaveText("");
  await expect(page.locator(".kinds h3").first()).toBeVisible();
  await expect(page.getByText(/Qloo calls?/)).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(/^Qloo/m);
  await fits(page);
  await page.getByRole("link", { name: "See your partner" }).click();

  await expect(heading).toHaveText(/^.+ is your partner\.$/, { timeout: 30_000 });
  const partner = /^(.+) is your partner\.$/.exec((await heading.textContent()) ?? "")?.[1] ?? "";
  expect(partner).not.toBe("");
  await expect(page.locator(".stepper [aria-current=step] .step-no")).toHaveText("2");
  await expect(page.locator(".stepper a .step-no")).toHaveText(["1"]);
  await expect(page.locator(".pair .door .cover-paper")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: /^Fit score, \d+ of 100$/ })).toBeAttached();
  await expect(page.locator("#fit .check")).toHaveCount(6);
  await expect(page.locator("#fit .check[data-key=back] .check-sentence")).toHaveText(/^(Larkspur Books is \d+\w\w of the \d+ places .+ crowd loves\.( It goes both ways\.)?|Larkspur Books is not among .+|Not checked\..+)$/);
  await expect(page.locator(".pair .door-them .door-name")).toContainText(partner);
  await expect(page.getByText("What both places share.")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Qloo");
  await fits(page);
  await page.getByRole("link", { name: `Plan the night with ${partner}` }).click();

  await expect(heading).toHaveText(/^.+, \w+day \d+ \w+\.$/, { timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "The evening" })).toBeVisible();
  await expect(page.locator(".stops > .stop:not(.stop-walk)")).toHaveCount(2);
  await expect(page.locator(".stops .stop-you")).toHaveCount(1);
  await expect(page.locator(".stops .stop-them")).toHaveCount(1);
  await expect(page.locator("main")).not.toContainText(/watch night/i);
  await expect(page.getByRole("radio", { name: /^Tuesday/ })).toBeChecked();
  await expect(page.getByRole("heading", { name: "Who comes from where" })).toBeVisible();
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
  await expect(neighbour.locator(".door-word")).toHaveCount(2);
  // The partner sets its own part before saying yes.
  await neighbour.getByLabel(/^What runs at /).fill("Our usual Tuesday tasting, as planned");
  await neighbour.getByRole("button", { name: /^We.re in$/ }).click();
  await expect(neighbour.locator(".answer-in")).toContainText("Your part is down as Our usual Tuesday tasting, as planned");

  await expect(heading).toHaveText(`${partner} is in`, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Publish the night" })).toHaveCount(0);
  await page.getByRole("link", { name: "Review and publish" }).click();
  await expect(heading).toHaveText("Review and publish");
  await expect(page.getByRole("heading", { name: "The evening as it goes out" })).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).not.toHaveValue("");
  await expect(page.locator(".stops .stop-them .stop-proposed")).toHaveCount(0);
  await fits(page);
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
  await pickCity(page, "Leeds");
  await page.getByRole("textbox", { name: "Your venue" }).fill("Juniper Books");
  await page.locator(".find-pick").filter({ hasText: "Juniper Books" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your crowd", { timeout: 30_000 });
  await page.getByRole("link", { name: "See your partner" }).click();
  await page.getByRole("link", { name: /^Plan the night with / }).click();
  const ask = page.getByRole("button", { name: /^Ask / });
  const partner = ((await ask.textContent()) ?? "").replace(/^Ask /, "");
  await ask.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Waiting for ${partner}`);
  await expect(page.getByRole("button", { name: "Publish the night" })).toHaveCount(0);
  await expect(page.locator(".live-status")).toBeVisible();
});

test("a venue page without the owner link asks for it", async ({ page }) => {
  await page.goto("/v/abcdefghijklmnopqrstuv");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Open your owner link");
});
