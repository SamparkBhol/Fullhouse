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
  // The read waits until the reading screen has been checked, so the check never races the read.
  let release: () => void = () => undefined;
  const held = new Promise<void>((r) => (release = r));
  await page.route(/\/api\/venues\/[^/]+\/read$/, async (route) => {
    await held;
    await route.continue();
  });
  await pick.click();

  const heading = page.getByRole("heading", { level: 1 });
  await expect(page).toHaveURL(/\/v\/[^/]+\/first$/);
  await expect(heading).toHaveText("Reading the crowd of Larkspur Books");
  await expect(page.locator(".venue-name")).toHaveText("Larkspur Books");
  await expect(page.getByRole("navigation", { name: "Your venue" })).toHaveCount(0);
  await expect(page.locator(".stepper li")).toHaveCount(3);
  await expect(page.locator(".stepper [aria-current=step] .step-no")).toHaveText("1");
  await expect(page.getByRole("heading", { name: "Your street" })).toBeVisible();
  await expect(page.locator(".map-reading .pin-you")).toBeVisible();
  await expect(page.getByRole("heading", { name: /three things about your room$/i })).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/^Qloo/m);
  await fits(page);
  release();

  // Straight from the read to the decision: no list of the crowd first.
  await expect(page).toHaveURL(/\/v\/[^/]+\/first\/match$/, { timeout: 30_000 });
  await expect(heading).toHaveText(/^.+ is your partner\.$/, { timeout: 30_000 });
  const partner = /^(.+) is your partner\.$/.exec((await heading.textContent()) ?? "")?.[1] ?? "";
  expect(partner).not.toBe("");
  await expect(page.locator(".stepper [aria-current=step] .step-no")).toHaveText("1");
  await expect(page.locator(".stepper a")).toHaveCount(0);
  await expect(page.locator(".pair .door .cover-paper")).toHaveCount(2);

  // The board: the list in order, the partner in plum, and why each place above it was passed over.
  const board = page.locator("#board");
  await expect(board.getByRole("heading", { name: "How Full House chose" })).toBeVisible();
  await expect(board.locator(".decision-lead")).toHaveText(new RegExp(`^Full House (checked the \\d+ places Qloo lists for your crowd nearby and chose the 1st|chose the \\d+\\w\\w of Qloo's \\d+), ${partner}\\.`));
  await expect(board.locator("> .choices > .choice-partner")).toHaveCount(1);
  await expect(board.locator(".choice-partner .choice-name")).toContainText(partner);
  const rows = board.locator("> .choices > .choice");
  expect(await rows.count()).toBeLessThanOrEqual(10);
  const ranks = (await board.locator("> .choices .choice-rank [aria-hidden]").allTextContents()).map(Number);
  expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  await expect(board.locator(".choice-why").first()).not.toBeEmpty();
  const swaps = await board.locator(".choice-runner-up").count();
  await expect(board.getByRole("button", { name: /^Swap to / })).toHaveCount(swaps);
  await expect(page.getByRole("heading", { name: "Or work with" })).toHaveCount(0);

  // On a phone the board sits under the pair, before the checks.
  const pairBox = await page.locator(".pair").boundingBox();
  const boardBox = await board.boundingBox();
  const fitBox = await page.locator("#fit").boundingBox();
  expect(boardBox!.y).toBeGreaterThan(pairBox!.y);
  expect(fitBox!.y).toBeGreaterThan(boardBox!.y);

  await expect(page.getByRole("heading", { name: /^Fit score, \d+ of 100$/ })).toBeAttached();
  await expect(page.locator("#fit .check")).toHaveCount(6);
  await expect(page.locator("#fit .check[data-key=back] .check-sentence")).toHaveText(/^(Larkspur Books is \d+\w\w of the \d+ places .+ crowd loves\.( It goes both ways\.)?|Larkspur Books is not among .+|Not checked\..+)$/);
  await expect(page.locator(".pair .door-them .door-name")).toContainText(partner);
  await expect(page.getByText("What both places share.")).toBeVisible();
  const said = (await page.locator("main").innerText()).match(/Qloo/g) ?? [];
  expect(said).toHaveLength(1);
  await expect(page.locator("main")).not.toContainText(/^Qloo/m);
  await fits(page);
  await page.getByRole("link", { name: `Plan the night with ${partner}` }).click();

  await expect(heading).toHaveText(/^.+, \w+day \d+ \w+\.$/, { timeout: 45_000 });
  await expect(page.locator(".stepper [aria-current=step] .step-no")).toHaveText("2");
  await expect(page.locator(".stepper a .step-no")).toHaveText(["1"]);
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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/ is your partner\.$/, { timeout: 30_000 });
  await page.getByRole("link", { name: /^Plan the night with / }).click();
  const ask = page.getByRole("button", { name: /^Ask / });
  const partner = ((await ask.textContent()) ?? "").replace(/^Ask /, "");
  await ask.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Waiting for ${partner}`);
  await expect(page.getByRole("button", { name: "Publish the night" })).toHaveCount(0);
  await expect(page.locator(".live-status")).toBeVisible();
});

test("a runner up on the board swaps in as the partner, and the board says it was the owner's pick", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await pickCity(page, "Leeds");
  await page.getByRole("textbox", { name: "Your venue" }).fill("Larkspur Books");
  await page.locator(".find-pick").filter({ hasText: "Larkspur Books" }).first().click();
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText(/ is your partner\.$/, { timeout: 30_000 });
  const first = /^(.+) is your partner\.$/.exec((await heading.textContent()) ?? "")?.[1] ?? "";
  const swap = page.locator("#board").getByRole("button", { name: /^Swap to / }).first();
  test.skip(!(await swap.count()), "the fake street gave this venue no runner up");
  const next = ((await swap.getAttribute("aria-label")) ?? "").replace(/^Swap to /, "");
  await swap.click();
  await expect(heading).toHaveText(`${next} is your partner.`, { timeout: 30_000 });
  await expect(page.locator("#board .choice-partner .choice-name")).toContainText(next);
  await expect(page.locator("#board .choice-partner .choice-why")).toContainText(`Your pick over ${first}`);
  await expect(page.locator("#board .choice-runner-up .choice-name").filter({ hasText: first })).toHaveCount(1);
});

test("a venue page without the owner link asks for it", async ({ page }) => {
  await page.goto("/v/abcdefghijklmnopqrstuv");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Open your owner link");
});
