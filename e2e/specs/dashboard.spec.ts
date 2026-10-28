import type { Browser } from "playwright/test";
import { weekdayInThreeDays } from "../support/dates.ts";
import { BASE_URL } from "../support/env.ts";
import { PHONE, SIDEWAYS, SMALL_TARGETS } from "../support/layout.ts";
import { openAsOwner, publishedNight } from "../support/owner.ts";
import { expect, test } from "../support/test.ts";

// A guest on their own phone: a fresh browser with its own cookie says yes on the public event page.
async function sayYes(browser: Browser, slug: string): Promise<void> {
  const guest = await browser.newContext({ baseURL: BASE_URL });
  const page = await guest.newPage();
  await page.goto(`/e/${slug}`);
  await page.getByRole("button", { name: "I am going" }).click();
  await expect(page.locator(".count")).toContainText("said they are coming");
  await guest.close();
}

test("venue home shows the numbers strip, and it opens the Numbers tab", async ({ page, request, browser }) => {
  const { owner, night } = await publishedNight(request, { name: "Fern Hall Records", city: "Leeds", weekday: weekdayInThreeDays() });
  await sayYes(browser, night.eventSlug ?? "");
  await openAsOwner(page, owner);

  // The night out sits above the strip with its own yes count, so the strip does not repeat it.
  await expect(page.locator(".rsvp-line")).toContainText("1 person has said they are coming.");
  const strip = page.locator("section", { has: page.getByRole("heading", { name: "Your numbers" }) });
  await expect(strip).toContainText("None logged yet");
  await expect(strip.locator(".strip-cell")).toHaveCount(2);
  await expect(strip.locator(".counter")).toHaveCount(0);
  await expect(strip.locator(".strip-cell").nth(1)).toContainText("1");
  await strip.getByRole("link", { name: "Open your numbers" }).click();

  await expect(page).toHaveURL(new RegExp(`/v/${owner.venue.id}/dashboard$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your numbers");
  await expect(page.getByRole("navigation", { name: "Your venue" }).getByRole("link", { name: "Numbers", exact: true })).toHaveAttribute("aria-current", "page");
  const next = page.locator('[data-pane="next"]');
  await expect(next.locator(".counter .sr-only")).toHaveText("1 RSVP for your next night");
  await expect(next).toContainText("1 of a room of 40 have said yes.");

  const nights = page.locator('[data-pane="nights"]');
  await nights.getByText("Show as a table").click();
  await expect(nights.locator("tbody tr")).toHaveCount(1);
  await expect(nights.locator("tbody tr")).toContainText("On the street");
  const reads = page.locator('[data-pane="reads"]');
  await reads.getByText("Show as a table").click();
  await expect(reads.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator('[data-pane="mondays"]')).toContainText(/Next run \w{3} \d+ \w{3}, 09:00\./);

  await page.getByRole("link", { name: "Nights", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your nights");
  await page.getByRole("link", { name: "Numbers", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('[data-pane="next"] .counter .sr-only')).toHaveText("1 RSVP for your next night");
});

test("the next night's yes count updates by itself while the tab is open", async ({ page, request, browser }) => {
  const { owner, night } = await publishedNight(request, { name: "Moth Lane Books", city: "Leeds", weekday: weekdayInThreeDays() });
  await openAsOwner(page, owner, "/dashboard");
  const counter = page.locator('[data-pane="next"] .counter .sr-only');
  await expect(counter).toHaveText("0 RSVPs for your next night");

  await page.getByRole("radio", { name: "10 s" }).check();
  await expect(page.locator(".refresh-line")).toContainText("Checks every 10 s.");
  await sayYes(browser, night.eventSlug ?? "");
  await expect(counter).toHaveText("1 RSVP for your next night", { timeout: 25_000 });
  await expect(page.locator(".refresh-line")).toContainText("numbers updated");
});

test("a logged turnout shows against the room on the strip and the dashboard", async ({ page, request }) => {
  const { owner, night } = await publishedNight(request, { name: "Kiln Street Cafe", city: "Leeds", weekday: weekdayInThreeDays() });
  const res = await request.post(`/api/venues/${owner.venue.id}/nights/${night.id}/result`, {
    headers: { authorization: `Bearer ${owner.token}` },
    data: { headcount: 27 },
  });
  expect(res.ok()).toBe(true);
  await openAsOwner(page, owner);
  const strip = page.locator("section", { has: page.getByRole("heading", { name: "Your numbers" }) });
  await expect(strip).toContainText("27 of 40");
  await expect(strip).toContainText("None out yet");

  await openAsOwner(page, owner, "/dashboard");
  await expect(page.locator('[data-pane="next"]')).toContainText("No published night coming up.");
  const rooms = page.locator('[data-pane="rooms"]');
  await rooms.getByText("Show as a table").click();
  await expect(rooms.locator("tbody tr").first()).toContainText("40");
  await expect(rooms.locator("tbody tr").first()).toContainText("27");
  await expect(page.locator('[data-pane="nights"] .night-done')).toHaveCount(1);
});

test("the Numbers tab fits a 360 and a 390 px phone", async ({ page, request }) => {
  const { owner } = await publishedNight(request, { name: "Tin Roof Bar", city: "Leeds", weekday: weekdayInThreeDays() });
  for (const size of [PHONE, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await openAsOwner(page, owner, "/dashboard");
    await expect(page.locator('[data-pane="mondays"]')).toBeVisible();
    expect(await page.evaluate<string[]>(SIDEWAYS)).toEqual([]);
    expect(await page.evaluate<string[]>(SMALL_TARGETS)).toEqual([]);
  }
});
